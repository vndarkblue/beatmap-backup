# Overview: osu! Beatmap Backup

**osu! Beatmap Backup** là ứng dụng desktop hiện đại, an toàn và tối ưu hiệu năng cao, được thiết kế để giải quyết nhu cầu sao lưu, lọc, quản lý và khôi phục thư viện bài hát (beatmaps) cho người chơi osu! trên cả hai phiên bản **osu!stable** và **osu!lazer**.

---

## 1. Mục Đích & Bài Toán Cốt Lõi

Người chơi osu! thường sở hữu thư viện beatmap từ vài chục đến hàng trăm Gigabyte (hàng chục nghìn beatmapset). Khi cài lại máy, chuyển đổi giữa stable và lazer, hoặc chia sẻ bộ sưu tập bài hát yêu thích, việc sao chép toàn bộ thư mục bài hát là cực kỳ tốn thời gian và dung lượng lưu trữ.

**osu! Beatmap Backup giải quyết bài toán này bằng hai phương thức chính:**

1. **Sao lưu siêu nhẹ (Metadata-only Backup - `.bbak`)**:
   - Thay vì nén hàng trăm Gigabyte tệp âm thanh và video, ứng dụng trích xuất danh sách định danh `beatmapsetId` và metadata từ cơ sở dữ liệu của game thành tệp `.bbak` (chỉ nặng vài Megabyte).
   - Tệp `.bbak` có thể được dùng trên bất kỳ máy tính nào để tải lại toàn bộ bài hát từ các máy chủ mirror công cộng với tốc độ cao.
2. **Khôi phục & Tải xuống thông minh (High-performance Downloader)**:
   - Đọc tệp `.bbak`, phân luồng tải song song từ 5 mirror lớn (osu.direct, NeriNyan, catboy.best, Nekoha, BeatConnect).
   - Tự động điều tiết tốc độ (smart rate limiting), luân chuyển mirror khi bị 429/lỗi, kiểm tra tính toàn vẹn file nén `.osz` và lưu snapshot hàng đợi để có thể tiếp tục tải dở dang.
3. **Bộ lọc & Tìm kiếm sâu (Beatmap Filtering)**:
   - Tích hợp công cụ tìm kiếm không dấu, lọc theo Game Mode (osu!standard, Taiko, Catch, Mania), Star Rating, BPM, trạng thái Ranked/Loved, hoặc theo từng Collection cụ thể để xuất các gói backup chuyên biệt.
4. **Hỗ trợ Song Song Stable & Lazer**:
   - Đọc trực tiếp `osu!.db` và `collection.db` của bản truyền thống (stable) qua worker thread.
   - Đọc trực tiếp `client.realm` của bản hiện đại (lazer) qua dynamic schema inspection ở chế độ read-only.
   - Hợp nhất vào một cơ sở dữ liệu SQLite cục bộ cực nhanh.

---

## 2. Triết Lý Thiết Kế Codebase

1. **An toàn dữ liệu tuyệt đối (Zero Data Corruption)**:
   - Không bao giờ chạm vào file của game khi game đang chạy.
   - Mọi thao tác ghi file quan trọng đều là ghi nguyên tử (`atomicWriteFile`).
2. **Tuân thủ đạo đức mạng (Respectful Rate Limiting)**:
   - Các mirror beatmap được duy trì bởi cộng đồng phi lợi nhuận. Codebase đặt các hằng số rate limit cứng để bảo vệ IP người dùng và không làm quá tải hạ tầng của mirror.
3. **Phân tách ranh giới nghiêm ngặt (Strict Process Isolation)**:
   - Renderer là giao diện thuần (Chromium). Không có đặc quyền Node.js, không truy cập đĩa trực tiếp. Mọi giao tiếp đi qua cầu nối kiểu nghiêm ngặt `window.electronAPI`.
4. **Tối ưu hóa tài nguyên (Lean Resource Footprint)**:
   - Main process giới hạn bộ nhớ V8 (`--max-old-space-size=256`).
   - Tắt các dịch vụ chạy nền không cần thiết của Chromium.
   - Parse các file nhị phân lớn trong luồng riêng (`worker_threads`), không làm giật khung hình giao diện.
5. **Đa ngôn ngữ & Thân thiện người dùng**:
   - Hỗ trợ đầy đủ tiếng Anh, tiếng Việt, tiếng Nhật với bộ từ điển đồng bộ 100%.

---

## 3. Bản Tóm Tắt Ngăn Xếp Công Nghệ (Tech Stack Summary)

- **Runtime & Desktop Shell**: Electron 35.1.5 (Node 22, ABI 133).
- **Bundler & Build Tool**: `electron-vite` 3.1.0, Vite 6.2.6, Rollup.
- **Frontend Framework**: Vue 3.5.13 (Composition API, `<script setup lang="ts">`).
- **Giao Diện & Styling**: Vuetify 3.8.7 (Material Design 3), `@mdi/js` SVG icons, Scoped CSS + Custom CSS Variables.
- **Quản Lý Trạng Thái**: Vue Composables thuần (`useBackupWorkflow`, `useDownloadQueue`, etc.).
- **Cơ Sở Dữ Liệu**: `better-sqlite3` 12.9.0 (WAL mode, custom collation), `realm` 12.6.0 (Read-only dynamic inspection).
- **Phân Tích Nhị Phân**: `osu-db-parser` 2.0.1.
- **Mạng & Luồng Tải**: Native HTTP/HTTPS streams, `p-queue` 8.1.0.
- **Đóng Gói Ứng Dụng**: `electron-builder` 25.1.8 (NSIS, Portable, AppImage, Snap, Deb, DMG).
- **Kiểm Thử & Đảm Bảo Chất Lượng**: Vitest 4.0.1, V8 coverage, ESLint 9 (Flat config), Prettier 3, Dual Typecheck (`tsc` + `vue-tsc`).
