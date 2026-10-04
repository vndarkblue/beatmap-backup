---
trigger: glob
globs: src/main/**/*.ts,src/preload/**/*.ts
---

# Main Process, IPC & Preload Bridge

## 1. The 4-Point Contract for Every IPC Endpoint

An IPC endpoint is only considered complete when all 4 locations are aligned (use skill `add-ipc-endpoint` when adding):

1. **Types** — `src/preload/electronApiTypes.ts`: Declare the method within the domain interface of
   `ElectronApi` alongside all payload/response/event types. This is the **single source of truth** for types
   between main ↔ renderer; never redefine IPC types elsewhere.
2. **Preload** — `src/preload/index.ts`: `ipcRenderer.invoke('<domain>:<action>', …)` exposed inside
   the `electronAPI: ElectronApi` bridge object.
3. **Handler** — `src/main/ipc/<domain>Ipc.ts`: `ipcMain.handle('<domain>:<action>', …)`.
4. **Teardown** — The channel name is included in the module's `channels` array (unregistered with
   `removeHandler` during registration for idempotency and within the teardown callback).

`src/preload/index.d.ts` declares `window.electronAPI` based on `ElectronApi` — do not modify unless changing the global identifier.

## 2. IPC Module Pattern (Following `downloadIpc.ts`)

```ts
export function registerXxxIpc(mainWindow: BrowserWindow): () => void {
  const channels = ['xxx:get-thing', 'xxx:do-thing']
  for (const ch of channels) ipcMain.removeHandler(ch) // idempotent across window reloads

  const service = XxxService.getInstance()

  ipcMain.handle('xxx:get-thing', async (_event, arg: string) => {
    if (typeof arg !== 'string' || !arg.trim()) throw new Error('Invalid argument')
    return service.getThing(arg)
  })

  const onProgress = (p: XxxProgress): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('xxx:progress', p)
  }
  service.on('progress', onProgress)

  return () => {
    for (const ch of channels) ipcMain.removeHandler(ch)
    service.removeListener('progress', onProgress)
    // clear local timers/buffers
  }
}
```

Mandatory Requirements:

- `register…Ipc()` **must return a teardown callback** that unregisters all handlers, service listeners, and timers.
  Teardowns are aggregated in `src/main/ipc/registerIpcHandlers.ts` — new modules must be registered there.
- **Validate every input from the renderer** inside the handler (types, non-empty, valid enums, path validity).
  The renderer must always be treated as untrusted.
- Check `!mainWindow.isDestroyed()` before invoking `webContents.send`.
- Keep handlers thin: validate inputs + invoke service + format response. Business logic belongs in `services/`.
- Standardize response structures: `{ success: boolean, … , error?: string }` for mutations; raw structured data
  for queries. Unexpected failures should `throw new Error(msg)` (causes renderer promise rejection).
- Returned objects must be **structured-cloneable**: no class instances with methods, no functions,
  no circular references. Serialize explicitly like `serializeTask()` in `downloadIpc.ts`.
- High-frequency events (download progress, task updates) must be **batched/throttled** (e.g.,
  `scheduleAddedTasksFlush` 50ms / chunk 500, `scheduleTaskUpdateFlush` 150ms). Never `send` per byte or per tick.
- File dialogs (`dialog.showSaveDialog/showOpenDialog`) must pass `mainWindow` as the parent window.

## 3. Preload Bridge

- Preload scripts only contain `ipcRenderer` wiring — **no business logic, no runtime service imports** (`import type` only).
- Complex payloads (filter criteria, state objects) must be cleanly cloned before sending:
  `JSON.parse(JSON.stringify(payload))` (as implemented for `database.filterBeatmaps`,
  `database.exportFilteredBackup`). This strips reactive Vue Proxies.
- Subscription functions with the signature `onXxx(listener)` **must return an unsubscribe function** that invokes
  `removeListener` with the exact registered callback. Never expose `ipcRenderer` or raw `ipcRenderer.on` to the renderer.

## 4. Existing Domains & Channels

Domains: `settings`, `download`, `database`, `backup`, `system`, `updater` (1 `<domain>Ipc.ts` file per domain)
plus `window:*` (`windowControls` namespace in preload, registered in `systemIpc.ts`).
Extend existing domains before considering a new one. Full channel lookup: `.agents/context/data-flow.md`.

Two channel types from renderer → main:

- **Default** `invoke` ↔ `ipcMain.handle` (request-response pattern) — unregistered via `removeHandler`.
- **Fire-and-forget** `send` ↔ `ipcMain.on` — strictly for commands not requiring responses (`window:minimize`,
  `updater:install`, `system:report-renderer-error`). Listeners must be named functions unregistered via
  `ipcMain.removeListener(channel, fn)` in teardown.

## 5. Main Entry & Window Management

- `src/main/index.ts`: Line 1 must be `import './initPortable'`, followed by `logger.init()`. Never insert
  imports above. Do not alter `webPreferences` (`contextIsolation: true`, `nodeIntegration: false`);
  `sandbox: false` is required by the current preload setup — do not change.
- Frameless window: min/max/close operations use `window.electronAPI.windowControls` (channel `window:*`)
  from `AppTitlebar.vue`; maximize state changes are pushed via `window:maximize-change`.
- Window bounds persistence: Managed by `windowState.ts` (tested in `tests/main/windowState.test.ts`).
- Periodic background tasks: Register within `backgroundServices.ts` and ensure `stopBackgroundServices()`
  clears associated timers and listeners.
