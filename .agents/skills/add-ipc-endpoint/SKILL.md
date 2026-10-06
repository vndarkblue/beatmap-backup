---
name: add-ipc-endpoint
description: >-
  Use this skill when adding or modifying an IPC communication channel between the Electron Main process and the Vue Renderer.
---

# Runbook: Adding a New IPC Endpoint (End-to-End)

Every communication channel between the Renderer and Main process must strictly adhere to the **4-point contract**.
Omitting any point can result in runtime exceptions, lack of TypeScript safety, or memory leaks.

---

## Step 1: Define Types (`src/preload/electronApiTypes.ts`)

All types transmitted across IPC must be declared in this file:

1. Add the method signature to the corresponding domain interface (`SettingsApi`, `DownloadApi`, `DatabaseApi`, `BackupApi`, `SystemApi`, `UpdaterApi`, `WindowControlsApi`).
2. Declare request payload and response interfaces:

   ```ts
   export interface MyNewPayload {
     targetId: string
     force?: boolean
   }

   export interface MyNewResult {
     success: boolean
     itemCount: number
     error?: string
   }
   ```

3. Update the domain interface:
   ```ts
   export interface DatabaseApi {
     // ... existing methods
     myNewAction: (payload: MyNewPayload) => Promise<MyNewResult>
   }
   ```

---

## Step 2: Implement Preload Bridge (`src/preload/index.ts`)

Implement the method within the `electronAPI` bridge object:

- **For Request - Response calls (async/await)**:

  ```ts
  myNewAction: (payload: MyNewPayload) => ipcRenderer.invoke('database:my-new-action', payload),
  ```

  _(Note: If payload comes from reactive Vue state, clone it cleanly: `JSON.parse(JSON.stringify(payload))`.)_

- **For Event Push Subscriptions**:
  Must return an `unsubscribe` callback:
  ```ts
  onMyProgress: (listener: (data: MyProgressEvent) => void) => {
    const handler = (_: IpcRendererEvent, data: MyProgressEvent): void => listener(data)
    ipcRenderer.on('database:my-progress', handler)
    return () => {
      ipcRenderer.removeListener('database:my-progress', handler)
    }
  }
  ```

---

## Step 3: Register Main Process Handler (`src/main/ipc/<domain>Ipc.ts`)

1. Add the channel identifier to the `channels` array for idempotent cleanup:
   ```ts
   const channels = [
     // ... existing channels
     'database:my-new-action'
   ]
   ```
2. Register the handler using `ipcMain.handle`:

   ```ts
   ipcMain.handle('database:my-new-action', async (_event, payload: MyNewPayload) => {
     // 1. Strictly validate input from Renderer
     if (!payload || typeof payload.targetId !== 'string' || !payload.targetId.trim()) {
       throw new Error('Invalid targetId provided')
     }

     // 2. Delegate execution to Singleton Service
     const result = await databaseService.doSomething(payload.targetId, payload.force)

     // 3. Return structured-cloneable result
     return {
       success: true,
       itemCount: result.count
     }
   })
   ```

---

## Step 4: Verify Teardown Cleanup

Examine the return of `register<Domain>Ipc(mainWindow)`:

- Confirm the function returns a `() => void` teardown callback.
- The callback must iterate over all `channels` to invoke `ipcMain.removeHandler(ch)`.
- If subscribed to Service events, invoke `service.removeListener(...)`.
- If timers were created (`setTimeout`, `setInterval`), call `clearTimeout/clearInterval`.
- Ensure `src/main/ipc/registerIpcHandlers.ts` invokes this teardown when the main window closes.

---

## Step 5: Consume in Renderer (Composable / Component)

Inside a Vue Composable (`src/renderer/src/composables/useXxx.ts`):

```ts
const performAction = async (id: string): Promise<void> => {
  try {
    const response = await window.electronAPI.database.myNewAction({ targetId: id })
    if (!response.success) {
      // Handle business failure
    }
  } catch (err) {
    // Handle system failure or IPC rejection
    console.error('IPC call failed:', err)
  }
}
```

---

## Step 6: Verification

Run TypeScript compilation check to verify full end-to-end type safety:

```powershell
npm run typecheck
```

If typecheck succeeds with zero errors, the endpoint is complete and ready for production use.
