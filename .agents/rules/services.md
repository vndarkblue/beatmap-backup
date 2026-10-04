---
trigger: glob
globs: src/services/**/*.ts,src/utils/**/*.ts,src/config/**/*.ts
---

# Services Layer (Runs in Main Process)

## 1. Singleton Pattern

Services maintaining persistent state or resources (DB connection, queue, EventEmitter) must implement the Singleton pattern:

```ts
class XxxService extends EventEmitter {
  private static instance: XxxService
  private constructor() {
    super()
  }
  public static getInstance(): XxxService {
    if (!XxxService.instance) XxxService.instance = new XxxService()
    return XxxService.instance
  }
}
export default XxxService
```

- Existing Singletons: `DownloadService`, `DatabaseService`, `SyncManager`, `BeatmapMirrorService`,
  `CollectionSyncService`, `UpdateService`, `AppLogger` (exports `logger`). `realmService` is an exported
  constant object — preserve this structure.
- Never instantiate services using `new` externally; always call `getInstance()`. Never establish a second
  singleton instance for the same resource (e.g., opening an additional SQLite handle to `beatmaps.db`).
- **Stateless modules** (parsers, pure helpers like `stableDbParserUtils.ts`, `backupNaming.ts`,
  `oszMetadata.ts`) should export pure functions rather than classes to facilitate unit testing.

## 2. Event Push Architecture

- Services emit events using `EventEmitter`; event names must be typed constants or enums (e.g., `DownloadEvent.TASK_ADDED`).
- Services **have no knowledge** of `BrowserWindow` or `webContents`. Bridging events to the renderer is the
  responsibility of `src/main/ipc/*` modules.
- Every `on(...)` subscription must have a matching `removeListener(...)` teardown (typically inside IPC teardown).

## 3. File System Operations

- User-facing data (`.bbak`, queue snapshots, export archives, self-managed settings) must be written using
  `atomicWriteFile(targetPath, content, options?)` from `src/utils/fileUtils.ts`. Never use raw `fs.writeFile` on target paths.
- Use `fs.promises` (asynchronous) for heavy I/O; avoid `*Sync` methods in hot execution paths (outside existing startup code).
- Paths joined from external input must use `safeJoinWithinRoot()` / `validateRelativeSubPath()`
  (refer to rule `security-paths`).
- User data paths must always derive from `app.getPath('userData')` (which portable mode redirects).
  Never hardcode `%APPDATA%` or absolute filesystem paths.

## 4. Logging & Error Reporting

- Import logger via `import { logger } from './logger'` (relative path). API: `logger.info|warn|error(message, ...meta)`.
  Passed `Error` instances are automatically logged with stack traces. Use contextual tags:
  ``logger.warn(`[BeatConnect] ...`)``.
- `logger` captures standard `console.*` output, but critical workflows (sync, download, export, update) must invoke
  `logger` directly.
- **Never log** Beatconnect API tokens, `Token` headers, or encrypted settings values.
- Record startup benchmarks using `startupMark('scope:event')` when adding steps to initialization.
- Categorize errors explicitly instead of swallowing them; empty `catch {}` blocks are only acceptable with documented reasoning.

## 5. Settings & Secrets

- Read and persist settings via `src/services/settingsStore.ts` (`electron-store`, storing `settings.json`).
  Adding a new configuration property requires updating **all 3 locations** in that file: the `Settings` interface,
  the `defaultSettings` object, and the explicit property mapping in `getSettings()` (unmapped properties will
  never reach the renderer). Check `updateSettings()` if validation or sanitization is required.
  `Settings` is re-exported as `AppSettings` in `electronApiTypes.ts`.
- Secrets (Beatconnect tokens) are encrypted via `safeStorage`; never pass raw tokens over IPC; runtime access is managed
  via `setBeatconnectRuntimeToken()` / `getBeatconnectRuntimeToken()` in `config/beatmapMirrors.ts`.

## 6. CPU-Bound Tasks & Worker Threads

- Heavy binary parsing (`osu!.db`) executes in `worker_threads` (`src/services/workers/stableImportWorker.ts`,
  spawned from `stableImporter.ts`). Worker threads must not import `electron`.
- Adding a new worker thread requires registering an entry in `electron.vite.config.ts` (`main.build.rollupOptions.input`).

## 7. Config & Utilities

- `src/config/appConstants.ts`: Main/app level constants (window dimensions, application ID, etc.).
- `src/config/frontendConstants.ts`: UI constants, `STORAGE_KEYS`, timings. Contains legacy constant
  `DOWNLOAD_SSE_RECONNECT` (see `known-gaps`) — do not use.
- `src/config/beatmapMirrors.ts`: Mirror definitions (enforces 95/95 coverage — any modification requires testing).
- `src/utils/*`: Must remain decoupled from service layers. Files imported by the renderer must not import Node modules.
