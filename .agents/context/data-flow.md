# Data Flow & IPC Channel Reference

Detailed reference covering core business data flows and the complete catalog of IPC channels.

---

## 1. Multi-Process Communication Architecture

```
[Renderer (Vue 3)]
       │  (1) Query data: await window.electronAPI.<domain>.<method>(payload)
       │  (2) Event subscription: const unsub = window.electronAPI.<domain>.onXxx(cb)
       ▼
[Preload (ContextBridge)]
       │  (1) ipcRenderer.invoke('<channel>', payload)
       │  (2) ipcRenderer.on('<channel>', handler)
       ▼
[Main Process (IPC Handlers)]
       │  (1) ipcMain.handle('<channel>', async (_event, payload) => service.method())
       │  (2) mainWindow.webContents.send('<channel>', batchedData)
       ▼
[Services Layer]
       │  - SQLite / Realm / File System / HTTP Streams / Worker Threads
```

---

## 2. Core Business Workflows

### Workflow A: Beatmap Backup Workflow

- **Participating modules**: `Backup.vue`, `useBackupWorkflow.ts`, `backupIpc.ts`, `exportService.ts`, `localBeatmapExport.ts`.

1. **Source & Collection Selection**:
   - The user selects a source (`stable`, `lazer`, or `all`) with optional collection filters.
   - The UI invokes `backup.previewCollections(...)` to preview beatmaps contained within selected collections.
2. **Estimation**:
   - The UI invokes `backup.estimate(...)` to calculate beatmapset totals and approximate output sizes.
3. **Export Execution**:
   - **Mode 1 — Export `.bbak` metadata archive**:
     - The Main process extracts unique `beatmapsetId` records from SQLite.
     - Generates header metadata including export timestamp, beatmapset count, and applied filter criteria.
     - Persists the file using `atomicWriteFile()` to the user's selected path.
   - **Mode 2 — Export local `.osz` packages**:
     - Traverses files in the Stable `Songs/` directory or resolves sharded files in Lazer.
     - Assembles and compresses constituent files into standardized `.osz` archives.
     - Continuously emits progress updates across `backup:local-export-progress`.

---

### Workflow B: Beatmap Download Workflow

- **Participating modules**: `Download.vue`, `useDownloadQueue.ts`, `downloadIpc.ts`, `downloadService.ts`, `httpDownloader.ts`, `queuePersistence.ts`.

1. **Initialization**:
   - The user provides a `.bbak` file or initiates downloads from search/filter results.
   - Target destination directory accessibility and available disk space are verified via `downloadTargetValidator.ts`.
   - The UI invokes `download.start({ filePath, options, downloadPath })`.
2. **Queue Ingestion & Event Throttling**:
   - `DownloadService` instantiates `DownloadTask` objects initialized to `waiting` status.
   - Emits `DownloadEvent.TASK_ADDED` in batches (chunk size 500, 50ms throttle) to prevent renderer UI thread starvation.
3. **Intelligent Concurrency Dispatching**:
   - The scheduler assesses the health and concurrency limits of each mirror:
     - `catboy.best` (Mino): Max 2 concurrent streams, minimum 600ms interval, capped at 60 req/min.
     - `BeatConnect`: Max 5 concurrent streams (with token) or 2 concurrent streams / 800ms interval (guest).
     - Other mirrors: Max 3 concurrent streams.
4. **Streaming Download & Integrity Verification**:
   - Streams data directly into a temporary file (`.osz.download`).
   - Upon stream completion, calls `oszMetadata.ts` to inspect ZIP headers and `.osu` files.
   - If valid: renames to `.osz` and marks task as `completed`.
   - If corrupted/failed: fails over to the next fallback mirror; HTTP 429 triggers cooldown; HTTP 401 on BeatConnect downgrades to guest mode.
5. **Checkpointing & Recovery**:
   - Periodically serializes active queue state to `download-queue.json` using `atomicWriteFile`.
   - In case of an unexpected shutdown, application startup detects existing checkpoints and displays `DownloadRecoveryDialog.vue`.

---

### Workflow C: Game Data Synchronization & Beatmap Filtering

- **Participating modules**: `SettingsDatabaseCard.vue`, `BeatmapFilter.vue`, `databaseIpc.ts`, `syncManager.ts`, `stableImporter.ts`, `lazerImporter.ts`, `databaseService.ts`.

1. **Process Safety Check**:
   - `isOsuProcessRunning()` inspects running processes. If `osu.exe` is active, synchronization terminates immediately and returns `skipped`.
2. **osu!stable Synchronization**:
   - `stableImporter.ts` spawns a background `Worker` thread (`stableImportWorker.ts`).
   - The worker parses binary `osu!.db`, normalizes beatmap records, and reports progress back to Main.
   - Main executes bulk upserts into SQLite `beatmaps.db` (WAL mode).
3. **osu!lazer Synchronization**:
   - `lazerImporter.ts` opens `client.realm` in read-only mode.
   - Iterates through `BeatmapSet` objects and upserts them into SQLite.
4. **Search & Filter Query Execution**:
   - Renderer submits a filter object (Mode, Star Rating, BPM, Rank Status, Text Query, Collections).
   - Preload cleanly clones the object via `JSON.parse(JSON.stringify(filter))`.
   - `beatmapFilterQuery.ts` dynamically builds SQL queries utilizing `NORMALIZE_TEXT` for accent-insensitive search.

---

## 3. IPC Channel Catalog

### Request - Response Channels (`ipcMain.handle` ↔ `ipcRenderer.invoke`)

| Domain             | IPC Channel                       | Description                                                         |
| :----------------- | :-------------------------------- | :------------------------------------------------------------------ |
| **settings**       | `settings:get`                    | Reads complete application configuration (`AppSettings`)            |
|                    | `settings:update`                 | Applies partial configuration patch (`patch: Partial<AppSettings>`) |
|                    | `settings:reset`                  | Resets all application settings to defaults                         |
|                    | `settings:validate-path`          | Validates safety and existence of game paths or download folder     |
|                    | `settings:get-auto-detect-status` | Retrieves game path auto-detection results                          |
|                    | `settings:has-beatconnect-token`  | Checks if user has a configured Beatconnect token (boolean)         |
|                    | `settings:set-beatconnect-token`  | Encrypts and persists a new Beatconnect API token                   |
| **download**       | `download:start`                  | Initiates a download session from a `.bbak` file                    |
|                    | `download:control`                | Controls queue: pause (`pause`), resume (`resume`), or abort (`stop`)|
|                    | `download:get-state`              | Retrieves runtime queue state and recovery checkpoint status        |
|                    | `download:handle-recovery`        | Resumes (`resume`) or discards (`discard`) an interrupted queue     |
|                    | `download:get-tasks`              | Retrieves complete list of all download tasks                       |
|                    | `download:retry-failed`           | Resets failed download tasks to `waiting` for retry                 |
|                    | `download:clear-queue`            | Clears all tasks from the download queue                            |
|                    | `download:export-failed-backup`   | Exports failed beatmapset IDs into a new `.bbak` file               |
| **database**       | `database:get-status`             | Retrieves beatmap count, collection count, and last sync timestamp  |
|                    | `database:sync`                   | Triggers manual sync from stable, lazer, or both                    |
|                    | `database:sync-collections`       | Synchronizes user collections from game into SQLite                 |
|                    | `database:get-collection-status`  | Retrieves collection count and distribution statistics              |
|                    | `database:filter-beatmaps`        | Queries and filters beatmaps from SQLite                            |
|                    | `database:export-filtered-backup` | Exports filtered search results to a `.bbak` file                   |
| **backup**         | `backup:preview-collections`      | Previews beatmaps belonging to selected collections                 |
|                    | `backup:estimate`                 | Estimates beatmap counts and backup storage size                    |
|                    | `backup:export`                   | Exports backup (`.bbak` metadata or local `.osz` archives)          |
| **system**         | `system:select-directory`         | Opens native dialog to select a directory                           |
|                    | `system:select-backup-file`       | Opens native dialog to select a `.bbak` file                        |
|                    | `system:open-path`                | Opens folder in File Explorer (via `isSafeDirectoryToOpen` guard)   |
|                    | `system:open-external`            | Opens external URL in browser (via `isValidExternalUrl` guard)      |
|                    | `system:show-item-in-folder`      | Highlights file in File Explorer (via `isSafePathToShow` guard)     |
|                    | `system:get-mirrors-status`       | Retrieves online/offline health status for 5 mirrors                |
|                    | `system:open-log-folder`          | Opens directory containing application logs (`app.log`)             |
|                    | `system:get-diagnostic-info`      | Retrieves diagnostic details (OS, RAM, Electron version, DB size)   |
| **updater**        | `updater:get-app-version`         | Retrieves current application version string                        |
|                    | `updater:get-distribution-type`   | Checks package distribution type (installed, portable, appimage)    |
|                    | `updater:get-last-result`         | Retrieves outcome of the most recent update check                   |
|                    | `updater:get-update-state`        | Retrieves current update download state                             |
|                    | `updater:check`                   | Checks for new updates from GitHub Releases                         |
|                    | `updater:download`                | Begins downloading update installer                                 |
|                    | `updater:open-release`            | Opens GitHub Release page in browser                                |
|                    | `updater:download-linux-appimage` | Downloads Linux AppImage package                                    |
|                    | `updater:show-install-confirm`    | Displays confirmation dialog to restart and install update          |
| **windowControls** | `window:is-maximized`             | Checks whether the application window is currently maximized        |

---

### Fire-and-Forget Channels (`ipcMain.on` ↔ `ipcRenderer.send`)

| IPC Channel                    | Description                                                     |
| :----------------------------- | :-------------------------------------------------------------- |
| `window:minimize`              | Minimizes the application window to taskbar                     |
| `window:maximize`              | Toggles window maximize and restore                             |
| `window:close`                 | Closes the application                                          |
| `updater:install`              | Exits application and triggers update installation              |
| `system:report-renderer-error` | Forwards unhandled renderer JavaScript errors to Main log file  |

---

### Push Event Channels (`webContents.send` ↔ `ipcRenderer.on`)

| Push Channel                   | Data Type             | Description                                                      |
| :----------------------------- | :-------------------- | :--------------------------------------------------------------- |
| `download:push-event`          | `DownloadPushEvent`   | Emits download progress, task additions, and queue state changes  |
| `database:sync-progress`       | `SyncProgressEvent`   | Emits binary parsing and database upsert progress updates        |
| `backup:local-export-progress` | `LocalExportProgress` | Emits count of packaged `.osz` files during local export         |
| `updater:push-event`           | `UpdatePushEvent`     | Emits update progress (`downloadProgress`, `updateDownloaded`)   |
| `window:maximize-change`       | `boolean`             | Notifies renderer when window maximized state toggles            |
