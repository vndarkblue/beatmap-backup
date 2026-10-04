---
trigger: glob
globs: src/services/**/*.ts,src/utils/**/*.ts,src/config/**/*.ts
---

# Services Layer (chạy trong Main process)

## 1. Singleton

Service có state/tài nguyên (DB connection, queue, EventEmitter) dùng Singleton:

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

- Hiện có: `DownloadService`, `DatabaseService`, `SyncManager`, `BeatmapMirrorService`,
  `CollectionSyncService`, `UpdateService`, `AppLogger` (export `logger`). `realmService` là
  object hằng số được export — giữ nguyên kiểu đó.
- Không `new` service ở nơi khác; luôn `getInstance()`. Không tạo singleton thứ hai cho cùng tài
  nguyên (vd. mở thêm kết nối SQLite tới `beatmaps.db`).
- Module **không state** (parser, helper thuần như `stableDbParserUtils.ts`, `backupNaming.ts`,
  `oszMetadata.ts`) → export function, không cần class. Ưu tiên hàm thuần để dễ test.

## 2. Event push

- Service phát sự kiện bằng `EventEmitter`; tên sự kiện là hằng/enum (vd `DownloadEvent.TASK_ADDED`).
- Service **không biết** `BrowserWindow`/`webContents`. Việc chuyển event sang renderer là của
  module `src/main/ipc/*`.
- Ai `on(...)` thì phải có đường `removeListener(...)` tương ứng (thường trong teardown IPC).

## 3. File system

- Ghi file người dùng quan tâm (`.bbak`, snapshot hàng đợi, file export, settings tự quản) →
  `atomicWriteFile(targetPath, content, options?)` từ `src/utils/fileUtils.ts`. Không
  `fs.writeFile` trực tiếp vào đích cuối.
- Dùng `fs.promises` (async) cho I/O lớn; tránh `*Sync` trong luồng nóng (trừ khởi tạo nhỏ đã có).
- Path ghép từ input bên ngoài → `safeJoinWithinRoot()` / `validateRelativeSubPath()`
  (xem rule `security-paths`).
- Vị trí dữ liệu: luôn dựa trên `app.getPath('userData')` (đã được portable mode điều hướng).
  Không hardcode `%APPDATA%` hay đường dẫn tuyệt đối.

## 4. Logging & lỗi

- `import { logger } from './logger'` (chỉnh đường dẫn tương đối). API: `logger.info|warn|error(
message, ...meta)`; `Error` truyền vào sẽ được log kèm stack. Tiền tố tag ngữ cảnh:
  ``logger.warn(`[BeatConnect] ...`)``.
- `logger` đã hook `console.*` nên console không mất, nhưng luồng trọng yếu (sync, download,
  export, update) phải dùng `logger` trực tiếp.
- **Không bao giờ log** token Beatconnect, header `Token`, hay nội dung settings đã mã hoá.
- Đánh dấu mốc khởi động bằng `startupMark('scope:event')` khi thêm bước vào startup.
- Phân loại lỗi rõ ràng thay vì nuốt lỗi; `catch {}` rỗng chỉ chấp nhận khi có comment lý do.

## 5. Settings & bí mật

- Đọc/ghi settings qua `src/services/settingsStore.ts` (electron-store, file `settings.json`).
  Thêm field mới phải sửa **đủ 3 chỗ** trong file đó: interface `Settings`, object
  `defaultSettings`, và mapping tường minh trong `getSettings()` (field không có ở đây sẽ không bao
  giờ tới được renderer). Kiểm tra thêm `updateSettings()` nếu field cần validate/chuẩn hoá.
  `Settings` được re-export là `AppSettings` trong `electronApiTypes.ts`.
- Bí mật (Beatconnect token) mã hoá bằng `safeStorage`; không trả token thô qua IPC; runtime dùng
  `setBeatconnectRuntimeToken()` / `getBeatconnectRuntimeToken()` trong `config/beatmapMirrors.ts`.

## 6. CPU-bound & worker

- Parse nhị phân lớn (`osu!.db`) chạy trong `worker_threads` (`src/services/workers/
stableImportWorker.ts`, khởi chạy từ `stableImporter.ts`). Worker không import `electron`.
- Worker mới ⇒ thêm entry trong `electron.vite.config.ts` (`main.build.rollupOptions.input`).

## 7. Config & utils

- `src/config/appConstants.ts`: hằng số main/app (window size, app id, …).
- `src/config/frontendConstants.ts`: hằng số UI, `STORAGE_KEYS`, timing. Có hằng chết
  `DOWNLOAD_SSE_RECONNECT` (xem known-gaps) — không dùng.
- `src/config/beatmapMirrors.ts`: danh sách mirror (coverage 95/95 — đổi gì cũng phải test).
- `src/utils/*` phải không phụ thuộc service. File dùng bởi renderer không được import Node.
