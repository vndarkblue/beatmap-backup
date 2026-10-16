---
trigger: glob
globs: src/renderer/**/*.ts,src/renderer/**/*.vue,src/renderer/**/*.css,src/renderer/index.html
---

# Renderer (Vue 3 + Vuetify 3)

The Renderer runs in Chromium under `contextIsolation` with **no Node.js access**. The only bridge to the outside
world is `window.electronAPI` (typed as `ElectronApi` from `src/preload/electronApiTypes.ts`).

## 1. Strict Prohibitions

- Never import `electron`, `fs`, `path`, `os`, `child_process`, `better-sqlite3`, `realm`,
  `electron-store`, `src/utils/fileUtils.ts`, or any runtime module from `src/services/**` or
  `src/main/**`. Only use `import type` (e.g.,
  `import type { DownloadTask } from '../../../preload/electronApiTypes'`).
- Do not use `window.electron` or `window.api` (template legacy; never use for new features).
- Do not introduce Pinia/Vuex, TailwindCSS, or external HTTP libraries; do not make direct `fetch` calls
  to mirrors or osu! APIs (all networking is managed by the Main process).
- Never use `v-html` with untrusted data.

## 2. Composables = State Management

- Every business workflow is managed by a dedicated composable in `src/renderer/src/composables/useXxx.ts`,
  exporting `function useXxx(): UseXxxReturn` with an **explicit return interface** (see `UseDownloadQueueReturn`).
- Reactive state (`ref`, buffers, `Map` indices, `unsubscribe` callbacks) must be created **inside** `useXxx()` —
  each invocation yields a fresh instance. Therefore, a workflow composable must be invoked **only once in its
  owning view** (e.g., `useDownloadQueue()` exclusively in `Download.vue`) and passed down to child cards via
  props/emits. Do not invoke `useDownloadQueue()` again inside child components. Only hoist state to module
  scope when an application-wide singleton is truly necessary, documenting the rationale.
- Workflows with complex state or push events (backup, download queue, updater) must contain their IPC wiring
  within their composable. Calling `window.electronAPI` directly inside components is reserved for simple,
  stateless actions (open folder, query version, window controls) as in `Settings*Card` and `AppTitlebar`.
- Always wrap IPC invocations with `try/catch`; present errors via UI components (snackbars/alerts) using i18n keys.

## 3. Push Event Subscriptions (Memory Leak Prevention)

```ts
let unsubscribe: (() => void) | null = null
const connect = async (): Promise<void> => {
  if (unsubscribe) return // idempotent
  const initial = await window.electronAPI.download.getTasks() // fetch snapshot first
  apply(initial)
  unsubscribe = window.electronAPI.download.onEvent(handlePush)
}
const disconnect = (): void => {
  unsubscribe?.()
  unsubscribe = null
}
```

Components must invoke `connect()` in `onMounted` and `disconnect()` in `onBeforeUnmount`. Never subscribe to
`onXxx` while discarding the returned unsubscribe callback.

## 4. UI Performance (Large Data Sets)

- Batch push event updates into local buffers and flush on intervals or via `requestAnimationFrame`
  (pattern: `pendingTaskUpdates` + `scheduleDownloadStateFlush` in `useDownloadQueue.ts`).
- Cap rendered rows (`MAX_RENDERED_DOWNLOAD_ROWS = 600`) or employ virtualized/paginated tables.
- Use `Map` indices for O(1) ID lookups; do not call `Array.find` inside hot render loops.
- Use `shallowRef` or wholesale array reassignment for large datasets that do not require deep reactivity.
- When sending reactive state over IPC, pass raw data (`toRaw` or clone), never send Vue Proxies.

## 5. Components & Layout

- Hierarchy: High-level views in `components/*.vue` (`Backup.vue`, `Download.vue`, `BeatmapFilter.vue`,
  `Settings.vue`) delegating to domain cards in `components/<domain>/`. Reusable widgets belong in
  `components/common/` (`AppForm`, `AppIsland`, `AppViewShell`, `PathField`).
- Routing: Uses `createWebHashHistory` in `src/renderer/src/router.ts` — **never** switch to HTML5 history
  mode (breaks under Electron's `file://` protocol).
- Vuetify components are auto-imported (`vite-plugin-vuetify`); themes and palettes are defined in
  `src/renderer/src/main.ts`, CSS tokens in `assets/main.css`, and custom Torus fonts in `assets/fonts`.
- Icons: Use `$name` aliases registered in `appIconAliases` (`main.ts`).
- Custom scrollbars: `simplebar-vue`.
- Displayed app version: Global `__APP_VERSION__`.
- `localStorage` keys must come from `STORAGE_KEYS` / `THEME_PREF_KEY` in `src/config/frontendConstants.ts`,
  with reads wrapped in `try/catch`.

## 6. Error Handling

`main.ts` configures `app.config.errorHandler` and `window.addEventListener('error')` to report errors to Main
via `window.electronAPI.system.reportRendererError(...)` (fire-and-forget channel `system:report-renderer-error`).
Do not remove this handler; never swallow errors silently. (Unhandled promise rejection listener is not yet
implemented — always catch IPC promises explicitly).

## 7. Internationalization (i18n)

Every user-facing string must use `t('…')` / `$t('…')`. Refer to rule `i18n` and skill `add-i18n-text`.

## 8. Animation & Transition Standards

1. **Accessibility (`prefers-reduced-motion`) is Mandatory**:

   - Every animation (CSS transitions, `@keyframes`, View Transitions API, WAAPI) must respect OS accessibility settings.
   - On Windows, turning off "Animation effects" sets `prefers-reduced-motion: reduce = true`. On Linux, this maps to `enable-animations = false` in desktop environments (GNOME/KDE).
   - When reduced motion is preferred, animations must fall back to instant state changes without visual movement:
     - In JavaScript: check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` before invoking `startViewTransition()`.
     - In CSS: include `@media (prefers-reduced-motion: reduce)` blocks with `animation: none !important; transition: none !important;`.

2. **View Transitions API Inviolable Rules**:

   - **Never apply `animation: none !important` to parent pseudo-elements** (`::view-transition`, `::view-transition-group`, `::view-transition-image-pair`).
     _Root cause_: If all pseudo-elements have `animation: none`, Chromium considers the transition active list empty and **immediately skips/destroys the transition tree** before JavaScript Web Animations API (`element.animate()`) can run.
   - **Target only leaf snapshots**: Reset animations only on specific leaf pseudo-elements without `!important`:
     ```css
     ::view-transition-old(root),
     ::view-transition-new(root) {
       animation: none;
       mix-blend-mode: normal;
     }
     ```
   - **Named Transitions**: Isolate independent animating elements (e.g., icons) with a unique `view-transition-name` (e.g., `theme-toggle-icon`). Elevate their `z-index` in `::view-transition-group(name)` so they render above full-screen reveals (`z-index: 10000` vs `root`'s `9999`).

3. **GPU-First & Zero CPU Overhead**:
   - Only animate `transform` and `opacity`. Never animate layout geometry (`width`, `height`, `margin`, `top`, `left`).
   - Avoid JavaScript-driven frame loops (e.g., SVG path morphing libraries like Morphicons/Flubber) during desktop operations. Desktop workloads (database parsing, download queues) require the Main thread to stay unblocked. Prefer CSS transforms, cross-fades, or CSS masks.
   - Timing: Micro-interactions (hover, active, icon toggles) should be 150ms–250ms. Complex transitions (theme reveals) should be 350ms–400ms with smooth easing (`cubic-bezier(0.4, 0, 0.2, 1)`).
