---
trigger: glob
globs: src/services/database/**/*.ts,src/services/collection/**/*.ts,src/services/processDetector.ts,src/services/realmService.ts
---

# osu! Data Access & Database Integrity Rules

Dự án tương tác trực tiếp với dữ liệu nhị phân của hai phiên bản game osu! khác biệt: **osu!stable** (tệp nhị phân `.db`) và **osu!lazer** (cơ sở dữ liệu NoSQL `client.realm`), sau đó hợp nhất vào SQLite cục bộ (`beatmaps.db`).

## 1. Luật Chặn Tiến Trình (Process Locking Guard)

> [!CAUTION] > **BẮT BUỘC KIỂM TRA TIẾN TRÌNH TRƯỚC KHI TRUY CẬP DỮ LIỆU GAME!**

1. Trước khi parse `osu!.db`, `collection.db`, hoặc mở `client.realm`, bắt buộc phải gọi:
   ```ts
   const proc = await isOsuProcessRunning(source) // 'stable' | 'lazer' | 'any'
   if (proc.running) {
     // Bỏ qua hoặc cảnh báo người dùng tắt game
   }
   ```
2. **Lý do**:
   - Khi game đang chạy, game giữ file lock trên `osu!.db` và `client.realm`.
   - Việc đọc/ghi đồng thời có thể gây sai lệch dữ liệu, khóa chết I/O (deadlock), hoặc làm crash game của người dùng.
3. Không cố gắng vượt qua cơ chế này bằng các cờ ép buộc đọc khi tiến trình còn sống.

## 2. Truy Cập Dữ Liệu osu!stable

1. **`osu!.db` (Danh mục Beatmaps)**:
   - Định dạng nhị phân độc quyền của osu!. Sử dụng thư viện `osu-db-parser`.
   - Vì tệp `osu!.db` có thể chứa hàng chục nghìn beatmap và tiêu tốn hàng trăm MB RAM khi parse nhị phân, thao tác này **bắt buộc chạy trong worker thread** (`src/services/workers/stableImportWorker.ts`) để tránh làm đơ Event Loop của Main process.
2. **`collection.db` (Bộ sưu tập)**:
   - Đọc qua `stableCollectionParser.ts`.
   - Chứa danh sách MD5 hashes của từng bài hát trong bộ sưu tập.
3. **Thư mục Songs**:
   - Thư mục chứa các tệp `.osz` giải nén. Khi backup hoặc export local, luôn dùng `safeJoinWithinRoot` khi duyệt bài hát.

## 3. Truy Cập Dữ Liệu osu!lazer

1. **`client.realm`**:
   - Cơ sở dữ liệu nhị phân Realm của osu!lazer.
   - Quản lý qua `realmService.ts` (`realm 12.6.0`).
   - Mở ở chế độ **read-only** (`readOnly: true`), dùng dynamic schema inspection để linh hoạt thích ứng với các bản cập nhật schema của osu!lazer.
   - Tuyệt đối không thực hiện bất kỳ thao tác ghi (`write`) nào vào `client.realm`.
2. **Kho lưu trữ tệp (Files sharding)**:
   - File trong lazer không lưu theo thư mục tên bài hát mà được hash (SHA-256) và phân mảnh vào `files/ab/abcdef...`.
   - Dịch vụ `localBeatmapExport.ts` tổng hợp các file thành phần dựa trên metadata của Realm để tạo lại file `.osz` chuẩn.

## 4. Cơ Sở Dữ Liệu Cục Bộ Ứng Dụng (`beatmaps.db`)

1. **Cấu hình SQLite (`better-sqlite3`)**:
   - Lưu trữ tại `userData/beatmaps.db`.
   - Luôn kích hoạt WAL mode (`PRAGMA journal_mode = WAL`) và foreign keys (`PRAGMA foreign_keys = ON`).
   - Đăng ký hàm tùy biến `NORMALIZE_TEXT` hỗ trợ tìm kiếm không dấu, loại bỏ ký tự Unicode phức tạp.
2. **Ưu tiên hợp nhất dữ liệu (Upsert Priority)**:
   - Khi cả Stable và Lazer cùng đồng bộ bài hát, tuân thủ logic độ ưu tiên quy định tại `upsertPriority.ts` để tránh ghi đè dữ liệu mới hơn bằng dữ liệu cũ hơn.
3. **Quản lý kết nối**:
   - Chỉ `DatabaseService.getInstance()` được phép giữ kết nối SQLite. Không khởi tạo kết nối mới song song.

## 5. Lưu Ý Về Phiên Bản ABI Của Native Addon

1. `better-sqlite3` và `realm` là C++ native addons, được biên dịch theo ABI của Electron 35 (`NODE_MODULE_VERSION 133`).
2. Không tự ý chỉnh sửa script `postinstall` trong `package.json` (`electron-builder install-app-deps`).
3. Khi test trên Node máy chủ (ABI khác), cần mock hoặc chạy môi trường đã rebuild tương thích (xem chi tiết tại `rules/workflow-tests.md`).
