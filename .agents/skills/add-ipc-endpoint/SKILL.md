---
name: add-ipc-endpoint
description: >-
  Use this skill when adding or modifying an IPC communication channel between the Electron Main process and the Vue Renderer.
---

# Runbook: Thêm Endpoint IPC Mới (End-to-End)

Mọi endpoint giao tiếp giữa Renderer và Main process phải tuân thủ nghiêm ngặt **hợp đồng 4 điểm**. Thiếu bất kỳ điểm nào cũng sẽ dẫn đến lỗi runtime, thiếu kiểm soát kiểu TypeScript hoặc rò rỉ bộ nhớ (memory leak).

---

## Bước 1: Định Nghĩa Kiểu Dữ Liệu (`src/preload/electronApiTypes.ts`)

Mọi kiểu truyền tải qua IPC bắt buộc phải được khai báo tại tệp này:

1. Thêm định nghĩa hàm vào interface domain tương ứng (`SettingsApi`, `DownloadApi`, `DatabaseApi`, `BackupApi`, `SystemApi`, `UpdaterApi`, `WindowControlsApi`).
2. Khai báo kiểu request payload và response trả về:

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

3. Cập nhật vào interface domain:
   ```ts
   export interface DatabaseApi {
     // ... các hàm cũ
     myNewAction: (payload: MyNewPayload) => Promise<MyNewResult>
   }
   ```

---

## Bước 2: Cài Đặt Cầu Nối Preload (`src/preload/index.ts`)

Triển khai phương thức trong đối tượng `electronAPI`:

- **Nếu là hàm Request - Response (có giá trị trả về hoặc cần await)**:

  ```ts
  myNewAction: (payload: MyNewPayload) => ipcRenderer.invoke('database:my-new-action', payload),
  ```

  _(Lưu ý: Nếu payload là object phức tạp từ Vue state, hãy clone sạch: `JSON.parse(JSON.stringify(payload))`)_

- **Nếu là hàm Đăng ký Sự kiện (Event Push)**:
  Bắt buộc trả về hàm hủy đăng ký (`unsubscribe`):
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

## Bước 3: Đăng Ký Handler Phía Main Process (`src/main/ipc/<domain>Ipc.ts`)

1. Thêm tên kênh vào danh sách `channels` để đảm bảo tính idempotent và cleanup:
   ```ts
   const channels = [
     // ... các channel cũ
     'database:my-new-action'
   ]
   ```
2. Đăng ký handler bằng `ipcMain.handle`:

   ```ts
   ipcMain.handle('database:my-new-action', async (_event, payload: MyNewPayload) => {
     // 1. Thẩm định chặt chẽ input từ Renderer
     if (!payload || typeof payload.targetId !== 'string' || !payload.targetId.trim()) {
       throw new Error('Invalid targetId provided')
     }

     // 2. Gọi logic xử lý từ Service Singleton
     const result = await databaseService.doSomething(payload.targetId, payload.force)

     // 3. Trả về kết quả có thể clone được (structured clone)
     return {
       success: true,
       itemCount: result.count
     }
   })
   ```

---

## Bước 4: Kiểm Tra Cơ Chế Dọn Dẹp (Teardown Verification)

Kiểm tra cuối hàm `register<Domain>Ipc(mainWindow)`:

- Đảm bảo hàm trả về một callback `() => void`.
- Callback đó phải lặp qua toàn bộ `channels` để gọi `ipcMain.removeHandler(ch)`.
- Nếu có listener sự kiện từ Service, phải gọi `service.removeListener(...)`.
- Nếu có bộ đếm giờ (`setTimeout`, `setInterval`), phải gọi `clearTimeout/clearInterval`.
- Kiểm tra tệp `src/main/ipc/registerIpcHandlers.ts` đã bao bọc teardown này khi cửa sổ chính đóng.

---

## Bước 5: Gọi Từ Phía Renderer (Composable / Component)

Trong Composable Vue (`src/renderer/src/composables/useXxx.ts`):

```ts
const performAction = async (id: string): Promise<void> => {
  try {
    const response = await window.electronAPI.database.myNewAction({ targetId: id })
    if (!response.success) {
      // Xử lý lỗi nghiệp vụ
    }
  } catch (err) {
    // Bắt lỗi hệ thống hoặc reject IPC
    console.error('IPC call failed:', err)
  }
}
```

---

## Bước 6: Kiểm Tra & Xác Nhận (Verification)

Chạy kiểm tra kiểu dữ liệu để đảm bảo toàn bộ chuỗi khớp 100%:

```powershell
npm run typecheck
```

Nếu không có bất kỳ lỗi typecheck nào, endpoint đã sẵn sàng sử dụng.
