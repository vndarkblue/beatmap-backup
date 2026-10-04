# Known Gaps, Legacy Traces & Pitfalls

This document details divergences between legacy planning notes and the current codebase, traces of dead code,
and technical pitfalls to prevent regressions or the reintroduction of deprecated patterns.

---

## 1. Legacy Planning Document (`notes.md`) Has Been Removed

Earlier in the project, the repository contained a `notes.md` file from initial development that described an architecture
that **no longer reflected the actual implementation** (referencing `constants.ts`, `api.ts`, `DownloadManager.vue`).
This file has been **removed** to avoid confusion.

1. **Configuration files have been modularized**:
   - `src/config/appConstants.ts` (Main process & application configuration).
   - `src/config/frontendConstants.ts` (Renderer, UI timing, and localStorage keys).
2. **Current Download Flow Architecture**:
   - Exclusively uses domain-driven IPC (`downloadIpc.ts`), the reactive `useDownloadQueue.ts` composable, and modular cards
     under `src/renderer/src/components/download/`. Neither Express nor `api.ts` exists.
3. **Rules for AI Agents**:
   - Always rely on `.agents/rules/` and `.agents/context/` as the primary sources of truth.
   - Never recreate `api.ts` or consolidate configuration back into a single `constants.ts`.

---

## 2. Dead Code: `DOWNLOAD_SSE_RECONNECT`

- Located in `src/config/frontendConstants.ts`:
  ```ts
  DOWNLOAD_SSE_RECONNECT: 5000
  ```
- **Origin**: An artifact from early prototypes when the project evaluated an internal HTTP server with Server-Sent Events (SSE).
- **Status**: The entire architecture has migrated 100% to Electron IPC push events (`webContents.send`). This constant is unreferenced.
- **Rule**: Never import or reference this constant in new code.

---

## 3. Lint Warning: `vue/no-v-html` in `SettingsAboutCard.vue`

- **Location**: `src/renderer/src/components/settings/SettingsAboutCard.vue` (line 111).
- **Issue**: ESLint emits a warning regarding direct usage of `v-html`.
- **Reason**: Used to render formatted license texts and author links containing HTML hyperlinks.
- **Rule**: When modifying this component, sanitize or migrate to safer Vue component structures rather than simply suppressing the rule.
  Never introduce `v-html` into any other component.

---

## 4. Native ABI Mismatch When Running Vitest on Host Machines

- **Problem**:
  - `better-sqlite3` and `realm` are C++ native addons compiled for Electron 35 (`NODE_MODULE_VERSION 133`).
  - When running `npm run test` using the host system's Node.js runtime (often Node 22 - `NODE_MODULE_VERSION 137`), Node reports
    a binary version mismatch in tests that import native addons directly:
    - `tests/services/database/databaseService.test.ts`
    - `tests/services/database/beatmapFilter.test.ts`
- **CI/CD Mitigation**:
  - In GitHub Actions (`.github/workflows/ci.yml`), the pipeline runs `npm rebuild better-sqlite3` prior to `npm run test:coverage`.
- **AI Agent Guidance**:
  - When completing tasks that do not alter C++ database bindings, execute the specific unit tests for modified components
    (e.g., `npx vitest run tests/services/pathGuards.test.ts`).
  - Clearly report test outcomes to the user and explain the ABI constraint if the two database tests fail on the host environment.

---

## 5. Renderer Unhandled Promise Rejections (`unhandledrejection`)

- Currently, `src/renderer/src/main.ts` hooks `window.addEventListener('error')` and `app.config.errorHandler` to report crashes
  to Main via `system:report-renderer-error`.
- Global unhandled promise rejection listeners are not yet attached.
- **Rule**: Every IPC promise invocation within Composables and Vue components must be wrapped in `try/catch` to handle exceptions
  gracefully and present informative error notifications to the user.
