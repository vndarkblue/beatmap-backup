# Data Flow & IPC Channel Reference

Tài liệu chi tiết về các luồng dữ liệu chính và toàn bộ danh mục kênh giao tiếp IPC giữa các tiến trình.

---

## 1. Cơ Chế Giao Tiếp Đa Tiến Trình

```
[Renderer (Vue 3)]
       │  (1) Kéo dữ liệu: await window.electronAPI.<domain>.<method>(payload)
       │  (2) Đăng ký sự kiện: const unsub = window.electronAPI.<domain>.onXxx(cb)
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

## 2. Chi Tiết Các Luồng Nghiệp Vụ Chính

### Luồng A: Quy Trình Sao Lưu Beatmap (Backup Workflow)

- **Thành phần tham gia**: `Backup.vue`, `useBackupWorkflow.ts`, `backupIpc.ts`, `exportService.ts`, `localBeatmapExport.ts`.

1. **Chọn nguồn & bộ sưu tập**:
   - Người dùng chọn nguồn (`stable`, `lazer`, hoặc `all`) và có thể lọc theo Collection.
   - UI gọi `backup.previewCollections(...)` để lấy danh sách bài hát thuộc bộ sưu tập.
2. **Ước tính (Estimate)**:
   - UI gọi `backup.estimate(...)` để tính toán số lượng beatmapset và dung lượng ước tính.
3. **Thực thi xuất (Export)**:
   - **Chế độ 1 - Xuất danh sách `.bbak`**:
     - Main process trích xuất danh sách `beatmapsetId` duy nhất từ SQLite.
     - Tạo header thông tin ngày xuất, số lượng bài hát, bộ lọc áp dụng.
     - Ghi tệp bằng `atomicWriteFile()` ra đường dẫn người dùng đã chọn.
   - **Chế độ 2 - Xuất tệp cục bộ `.osz`**:
     - Quét các tệp trong thư mục Songs của Stable hoặc phân mảnh files trong Lazer.
     - Gom và đóng gói thành tệp nén `.osz` chuẩn.
     - Bắn tiến độ liên tục qua kênh `backup:local-export-progress`.

---

### Luồng B: Quy Trình Tải Xuống Beatmap (Download Workflow)

- **Thành phần tham gia**: `Download.vue`, `useDownloadQueue.ts`, `downloadIpc.ts`, `downloadService.ts`, `httpDownloader.ts`, `queuePersistence.ts`.

1. **Khởi tạo**:
   - Người dùng nạp tệp `.bbak` hoặc bấm tải từ kết quả lọc.
   - Kiểm tra tính hợp lệ của thư mục tải và dung lượng đĩa qua `downloadTargetValidator.ts`.
   - UI gọi `download.start({ filePath, options, downloadPath })`.
2. **Nạp hàng đợi & gom lô sự kiện**:
   - `DownloadService` tạo các `DownloadTask` với trạng thái `waiting`.
   - Bắn sự kiện `DownloadEvent.TASK_ADDED` theo đợt (chunk 500 tasks, throttle 50ms) để không làm đơ UI Renderer.
3. **Phân phối luồng tải (Smart Dispatcher)**:
   - Hàng đợi kiểm tra trạng thái từng mirror:
     - `catboy.best` (Mino): tối đa 2 luồng song song, giãn cách tối thiểu 600ms, tối đa 60 requests/phút.
     - `BeatConnect`: tối đa 5 luồng (nếu có token) hoặc 2 luồng / 800ms (nếu không có token).
     - Các mirror khác: tối đa 3 luồng song song.
4. **Tải stream & kiểm tra toàn vẹn**:
   - Tải dữ liệu qua luồng HTTP stream trực tiếp vào file `.osz.download`.
   - Khi stream kết thúc, gọi `oszMetadata.ts` đọc cấu trúc tệp ZIP và header `.osu`.
   - Nếu hợp lệ: đổi tên thành `.osz` và đánh dấu `completed`.
   - Nếu lỗi: chuyển sang mirror tiếp theo; nếu gặp HTTP 429 kích hoạt cooldown mirror; nếu 401 trên BeatConnect thì hạ quyền khách.
5. **Lưu Checkpoint & Phục Hồi**:
   - Cứ mỗi khoảng thời gian định kỳ (`queueCheckpointIntervalMs`), lưu trạng thái hàng đợi vào `download-queue.json` bằng `atomicWriteFile`.
   - Nếu ứng dụng bị đóng đột ngột, khi khởi động lại sẽ phát hiện checkpoint và mở `DownloadRecoveryDialog.vue`.

---

### Luồng C: Đồng Bộ Dữ Liệu Game & Lọc Beatmap (Sync & Filter)

- **Thành phần tham gia**: `SettingsDatabaseCard.vue`, `BeatmapFilter.vue`, `databaseIpc.ts`, `syncManager.ts`, `stableImporter.ts`, `lazerImporter.ts`, `databaseService.ts`.

1. **Kiểm tra an toàn tiến trình**:
   - `isOsuProcessRunning()` quét tiến trình hệ thống. Nếu `osu.exe` đang chạy, quá trình đồng bộ dừng ngay lập tức và báo trạng thái `skipped`.
2. **Đồng bộ osu!stable**:
   - `stableImporter.ts` tạo một `Worker` thread (`stableImportWorker.ts`).
   - Worker đọc nhị phân tệp `osu!.db`, chuẩn hóa dữ liệu beatmap và bắn tiến độ về Main.
   - Main process thực hiện bulk upsert vào SQLite `beatmaps.db` (WAL mode).
3. **Đồng bộ osu!lazer**:
   - `lazerImporter.ts` mở `client.realm` ở chế độ read-only.
   - Duyệt các đối tượng `BeatmapSet` và import vào SQLite.
4. **Tìm kiếm & Lọc (Filter Query)**:
   - Renderer gửi đối tượng bộ lọc (Mode, Star, BPM, Rank, Text, Collection).
   - Preload clone sạch object qua `JSON.parse(JSON.stringify(filter))`.
   - `beatmapFilterQuery.ts` tạo câu lệnh SQL tương ứng, sử dụng hàm `NORMALIZE_TEXT` để tìm kiếm không phân biệt dấu tiếng Việt hay chữ hoa chữ thường.

---

## 3. Danh Mục Kênh Giao Tiếp IPC (IPC Channels Reference)

### Kênh Request - Response (`ipcMain.handle` ↔ `ipcRenderer.invoke`)

| Domain             | Kênh IPC                          | Mục đích                                                            |
| :----------------- | :-------------------------------- | :------------------------------------------------------------------ |
| **settings**       | `settings:get`                    | Đọc toàn bộ cấu hình ứng dụng (`AppSettings`)                       |
|                    | `settings:update`                 | Cập nhật một phần cấu hình (`patch: Partial<AppSettings>`)          |
|                    | `settings:reset`                  | Khôi phục toàn bộ cài đặt về mặc định                               |
|                    | `settings:validate-path`          | Kiểm tra tính hợp lệ của đường dẫn game hoặc thư mục tải            |
|                    | `settings:get-auto-detect-status` | Lấy kết quả quét tự động phát hiện đường dẫn game                   |
|                    | `settings:has-beatconnect-token`  | Kiểm tra xem người dùng đã lưu Beatconnect token hay chưa (boolean) |
|                    | `settings:set-beatconnect-token`  | Mã hóa và lưu Beatconnect token mới                                 |
| **download**       | `download:start`                  | Khởi chạy phiên tải xuống từ file backup `.bbak`                    |
|                    | `download:control`                | Tạm dừng (`pause`), tiếp tục (`resume`), hoặc hủy toàn bộ (`stop`)  |
|                    | `download:get-state`              | Lấy trạng thái runtime và trạng thái checkpoint phục hồi            |
|                    | `download:handle-recovery`        | Tiếp tục (`resume`) hoặc hủy bỏ (`discard`) checkpoint cũ           |
|                    | `download:get-tasks`              | Lấy toàn bộ danh sách tác vụ tải hiện có                            |
|                    | `download:retry-failed`           | Đặt lại trạng thái các bài tải lỗi về `waiting` để thử lại          |
|                    | `download:clear-queue`            | Dọn dẹp sạch danh sách tác vụ tải                                   |
|                    | `download:export-failed-backup`   | Xuất các beatmap tải lỗi thành file `.bbak` mới                     |
| **database**       | `database:get-status`             | Lấy số lượng beatmap, collection và ngày đồng bộ gần nhất           |
|                    | `database:sync`                   | Kích hoạt đồng bộ thủ công từ stable, lazer hoặc cả hai             |
|                    | `database:sync-collections`       | Đồng bộ bộ sưu tập bài hát từ game vào cơ sở dữ liệu                |
|                    | `database:get-collection-status`  | Lấy số lượng collection và thống kê phân bổ                         |
|                    | `database:filter-beatmaps`        | Tìm kiếm và lọc danh sách beatmap từ SQLite                         |
|                    | `database:export-filtered-backup` | Xuất kết quả lọc ra file `.bbak`                                    |
| **backup**         | `backup:preview-collections`      | Xem trước danh sách bài hát trong các collection đã chọn            |
|                    | `backup:estimate`                 | Ước tính số lượng bài hát và kích thước backup                      |
|                    | `backup:export`                   | Xuất file backup (`.bbak` hoặc `.osz` local)                        |
| **system**         | `system:select-directory`         | Mở hộp thoại hệ thống để chọn một thư mục                           |
|                    | `system:select-backup-file`       | Mở hộp thoại chọn tệp `.bbak`                                       |
|                    | `system:open-path`                | Mở thư mục trên File Explorer (qua guard `isSafeDirectoryToOpen`)   |
|                    | `system:open-external`            | Mở liên kết trình duyệt (qua guard `isValidExternalUrl`)            |
|                    | `system:show-item-in-folder`      | Trỏ tới file trong thư mục (qua guard `isSafePathToShow`)           |
|                    | `system:get-mirrors-status`       | Lấy trạng thái online/offline của 5 mirror                          |
|                    | `system:open-log-folder`          | Mở thư mục chứa file log ứng dụng (`app.log`)                       |
|                    | `system:get-diagnostic-info`      | Lấy thông tin chẩn đoán (OS, RAM, Electron version, DB size)        |
| **updater**        | `updater:get-app-version`         | Lấy phiên bản ứng dụng hiện tại                                     |
|                    | `updater:get-distribution-type`   | Kiểm tra gói cài đặt (installed, portable, appimage)                |
|                    | `updater:get-last-result`         | Lấy kết quả kiểm tra cập nhật gần nhất                              |
|                    | `updater:get-update-state`        | Lấy trạng thái tải bản cập nhật hiện tại                            |
|                    | `updater:check`                   | Kiểm tra bản cập nhật mới từ GitHub Releases                        |
|                    | `updater:download`                | Bắt đầu tải bản cập nhật                                            |
|                    | `updater:open-release`            | Mở trang GitHub Release trên trình duyệt                            |
|                    | `updater:download-linux-appimage` | Tải AppImage cho Linux                                              |
|                    | `updater:show-install-confirm`    | Hiển thị hộp thoại xác nhận khởi động lại để cập nhật               |
| **windowControls** | `window:is-maximized`             | Kiểm tra xem cửa sổ có đang ở trạng thái phóng to cực đại hay không |

---

### Kênh Fire-and-Forget (`ipcMain.on` ↔ `ipcRenderer.send`)

| Kênh IPC                       | Mục đích                                                        |
| :----------------------------- | :-------------------------------------------------------------- |
| `window:minimize`              | Thu nhỏ cửa sổ ứng dụng xuống taskbar                           |
| `window:maximize`              | Phóng to hoặc phục hồi kích thước cửa sổ                        |
| `window:close`                 | Đóng ứng dụng                                                   |
| `updater:install`              | Thoát ứng dụng và tiến hành cài đặt bản cập nhật mới            |
| `system:report-renderer-error` | Renderer báo cáo lỗi JavaScript về Main process để ghi file log |

---

### Kênh Đẩy Sự Kiện Từ Nền (`webContents.send` ↔ `ipcRenderer.on`)

| Kênh Push Event                | Kiểu dữ liệu          | Mô tả                                                                 |
| :----------------------------- | :-------------------- | :-------------------------------------------------------------------- |
| `download:push-event`          | `DownloadPushEvent`   | Cập nhật tiến độ tải, thêm task, thay đổi trạng thái hàng đợi         |
| `database:sync-progress`       | `SyncProgressEvent`   | Báo cáo tiến độ phân tích nhị phân và ghi database                    |
| `backup:local-export-progress` | `LocalExportProgress` | Báo cáo số lượng file `.osz` đã đóng gói khi xuất cục bộ              |
| `updater:push-event`           | `UpdatePushEvent`     | Báo tiến độ tải bản cập nhật (`downloadProgress`, `updateDownloaded`) |
| `window:maximize-change`       | `boolean`             | Thông báo thay đổi trạng thái Maximize của cửa sổ                     |
