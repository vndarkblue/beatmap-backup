---
trigger: glob
globs: src/**/*.ts,src/**/*.vue,electron.vite.config.ts
---

# Architecture & Module Boundaries

## 1. Four Layers and Dependency Directions

```
src/renderer/src  (Vue 3, Chromium, NO Node)
      │  window.electronAPI.<domain>.<method>()      ← only allowed route
src/preload       (contextBridge, typed bridge)
      │  ipcRenderer.invoke / ipcRenderer.on
src/main          (ipcMain.handle, window, lifecycle)
      │  direct invocation / EventEmitter
src/services      (business logic, SQLite, Realm, FS, HTTP, worker_threads)
      │
src/config, src/utils   (shared, pure TS, no upper dependencies)
```

Permitted Import Matrix:

| From \ To         | renderer | preload           | main | services          | config / utils         |
| :---------------- | :------- | :---------------- | :--- | :---------------- | :--------------------- |
| **renderer**      | ✅       | `import type` only| ❌   | `import type` only| ✅ (pure TS only)      |
| **preload**       | ❌       | ✅                | ❌   | `import type` only| ✅                     |
| **main**          | ❌       | `import type`     | ✅   | ✅                | ✅                     |
| **services**      | ❌       | `import type`     | ❌\* | ✅                | ✅                     |
| **config/utils**  | ❌       | ❌                | ❌   | ❌                | ✅                     |

\* Services must not import `src/main/**`. Existing exceptions: `logger.ts` and `updateService.ts` import
`isPortableMode` from `src/main/portable.ts` — accepted, do not expand further. Services are permitted
to import `electron` (main-side APIs such as `app`, `safeStorage`, `shell`) because they execute in the Main process.
`src/config/*` (pure TS: `frontendConstants`, `beatmapMirrors`, …) and `src/utils/beatmapTitle.ts`
can be used in renderer. Note: renderer importing `beatmapMirrors` receives its **own isolated module copy** —
the runtime Beatconnect token is always empty on the renderer side, do not rely on it.
`src/utils/fileUtils.ts` uses `fs` → **main/services only**. New files in `config/` / `utils/` consumed
by the renderer must never import Node modules.

## 2. Entry Points & Build

- `electron.vite.config.ts` defines 2 entries for main: `index` (`src/main/index.ts`) and
  `stableImportWorker` (`src/services/workers/stableImportWorker.ts`). Adding a new worker requires adding an entry
  to `rollupOptions.input`, otherwise the worker file will be missing in `out/`.
- `external: ['realm', 'electron', 'electron-store', 'better-sqlite3']` for main & preload — preserve as is.
- Renderer alias: `@renderer` → `src/renderer/src`. Global build-time constant: `__APP_VERSION__`.

## 3. Main Process Initialization (Order is a Contract)

1. `import './initPortable'` → `setupPortableUserData()` redirects `userData` to `data/` adjacent to the portable executable.
2. `logger.init()` immediately follows.
3. Apply performance command-line switches (`disable-background-networking`, `--max-old-space-size=256`, …).
4. Create `BrowserWindow` (frameless, `contextIsolation: true`, `nodeIntegration: false`).
5. `registerIpcHandlers(mainWindow)` → returns combined teardown; invoked when window closes.
6. `initEarlyServices()` then `startDeferredBackgroundServices()` (sync DB, updater, process watcher)
   in `src/main/backgroundServices.ts`; stopped via `stopBackgroundServices()`.

Never place heavy tasks (binary DB parsing, network calls) before the window is visible — schedule them in deferred services.

## 4. State & Persistence

- No global store: state lives within composables (`useBackupWorkflow`, `useDownloadQueue`,
  `useDownloadSettings`, `useUpdater`). State shared across components uses module-scoped `ref`
  variables within the composable.
- Persistent settings: `electron-store` via `src/services/settingsStore.ts`, accessed from renderer
  via `window.electronAPI.settings.*`. Beatconnect token is encrypted with `safeStorage` — renderer only
  queries `hasBeatconnectToken()`, never reads raw tokens.
- `localStorage` is strictly for temporary UI state/cache; never persist sensitive data or critical state here.
- App database: `userData/beatmaps.db` (WAL mode, foreign keys enabled, custom `NORMALIZE_TEXT` function).

## 5. Adding New Features — Where Code Belongs

| Code Type                          | Location                                                    |
| :--------------------------------- | :---------------------------------------------------------- |
| Business logic, I/O, networking    | `src/services/<domain>/…` (Singleton)                       |
| Exposing channels to renderer      | `src/main/ipc/<domain>Ipc.ts` + `preload/index.ts` + types  |
| UI state and workflow coordination | `src/renderer/src/composables/useXxx.ts`                    |
| UI presentation                    | `src/renderer/src/components/<domain>/PascalCase.vue`       |
| App / UI constants                 | `src/config/appConstants.ts` / `frontendConstants.ts`       |
| New mirror configuration           | `src/config/beatmapMirrors.ts` (see downloads-mirrors rule) |
| Heavy CPU-bound (binary parsing)   | `src/services/workers/` + entry in electron.vite config     |

Never recreate deprecated files: `src/config/constants.ts`, `api.ts`, `DownloadManager.vue`,
or any internal HTTP server / Server-Sent Events (SSE) mechanisms.
