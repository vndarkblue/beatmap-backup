---
trigger: glob
globs: src/main/**/*.ts,src/preload/**/*.ts
---

# Main Process, IPC & Preload Bridge

## 1. Hợp đồng 4 điểm của mọi IPC endpoint

Một endpoint chỉ "tồn tại" khi cả 4 chỗ khớp nhau (dùng skill `add-ipc-endpoint` khi thêm mới):

1. **Types** — `src/preload/electronApiTypes.ts`: khai báo method trong interface domain của
   `ElectronApi` và mọi kiểu payload/response/event. Đây là **nguồn kiểu duy nhất** giữa main ↔
   renderer; không khai báo lại kiểu IPC ở nơi khác.
2. **Preload** — `src/preload/index.ts`: `ipcRenderer.invoke('<domain>:<action>', …)` bên trong
   object `electronAPI: ElectronApi`.
3. **Handler** — `src/main/ipc/<domain>Ipc.ts`: `ipcMain.handle('<domain>:<action>', …)`.
4. **Teardown** — channel được thêm vào mảng `channels` của module (được `removeHandler` cả lúc
   đăng ký lẫn trong hàm teardown).

`src/preload/index.d.ts` khai báo `window.electronAPI` dựa trên `ElectronApi` — không sửa trừ khi
đổi tên global.

## 2. Mẫu module IPC (bám theo `downloadIpc.ts`)

```ts
export function registerXxxIpc(mainWindow: BrowserWindow): () => void {
  const channels = ['xxx:get-thing', 'xxx:do-thing']
  for (const ch of channels) ipcMain.removeHandler(ch) // idempotent khi window tạo lại

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
    // clear mọi timer/buffer cục bộ
  }
}
```

Bắt buộc:

- Hàm `register…Ipc()` **trả về teardown** gỡ hết handler, listener service, timer. Teardown được
  gộp trong `src/main/ipc/registerIpcHandlers.ts` — module mới phải được thêm vào đó.
- **Validate mọi input từ renderer** trong handler (kiểu, rỗng, enum hợp lệ, file tồn tại…).
  Renderer được coi là không tin cậy.
- Kiểm tra `mainWindow.isDestroyed()` trước mỗi `webContents.send`.
- Handler mỏng: chỉ validate + gọi service + định hình response. Logic nghiệp vụ nằm ở `services/`.
- Response giữ kiểu đã có: `{ success: boolean, … , error?: string }` cho action; dữ liệu thô cho
  query. Lỗi bất thường → `throw new Error(msg)` (renderer nhận reject).
- Object trả về phải **structured-clone được**: không class instance có method, không function,
  không circular. Serialize tường minh như `serializeTask()` trong `downloadIpc.ts`.
- Event tần suất cao (tiến trình tải, cập nhật task) phải **gom lô/throttle** (pattern
  `scheduleAddedTasksFlush` 50ms / chunk 500, `scheduleTaskUpdateFlush` 150ms). Không `send` theo
  từng byte/từng tick.
- Dialog (`dialog.showSaveDialog/showOpenDialog`) truyền `mainWindow` làm parent.

## 3. Preload

- Chỉ chứa wiring `ipcRenderer` — **không logic, không import service runtime** (chỉ `import type`).
- Payload phức tạp (filter object…) được clone sạch trước khi gửi:
  `JSON.parse(JSON.stringify(payload))` (đã có cho `database.filterBeatmaps`,
  `database.exportFilteredBackup`). Áp dụng cho payload mới có thể chứa Proxy reactive của Vue.
- Hàm subscribe dạng `onXxx(listener)` **phải trả về hàm unsubscribe** gọi `removeListener` với
  đúng handler đã đăng ký. Không bao giờ phơi `ipcRenderer` hay `ipcRenderer.on` thô ra renderer.

## 4. Kênh & domain hiện có

Domain: `settings`, `download`, `database`, `backup`, `system`, `updater` (mỗi domain 1 file
`<domain>Ipc.ts`) + `window:*` (namespace `windowControls` trong preload, đăng ký trong
`systemIpc.ts`). Thêm action vào domain sẵn có trước khi nghĩ tới domain mới. Danh sách kênh
chi tiết: `.agents/context/data-flow.md`.

Hai kiểu kênh renderer → main:

- **Mặc định** `invoke` ↔ `ipcMain.handle` (có kết quả/lỗi trả về) — gỡ bằng `removeHandler`.
- **Fire-and-forget** `send` ↔ `ipcMain.on` — chỉ cho lệnh không cần phản hồi (`window:minimize`,
  `updater:install`, `system:report-renderer-error`). Listener phải là hàm có tên và được gỡ bằng
  `ipcMain.removeListener(channel, fn)` trong teardown.

## 5. Main entry & window

- `src/main/index.ts`: dòng 1 `import './initPortable'`, dòng tiếp `logger.init()`. Không chèn
  import nào lên trên. Không đổi `webPreferences` (`contextIsolation: true`,
  `nodeIntegration: false`); `sandbox: false` là hiện trạng cần cho preload — không tự đổi.
- Window frameless: min/max/close đi qua `window.electronAPI.windowControls` (kênh `window:*`)
  từ `AppTitlebar.vue`; trạng thái maximize đẩy về qua `window:maximize-change`.
- Vị trí/kích thước cửa sổ: `windowState.ts` (có test `tests/main/windowState.test.ts`).
- Tác vụ nền định kỳ: thêm vào `backgroundServices.ts` và đảm bảo `stopBackgroundServices()` dọn
  timer/listener của nó.
