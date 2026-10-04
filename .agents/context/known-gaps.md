# Known Gaps, Legacy Traces & Pitfalls

Tài liệu ghi nhận các điểm lệch pha giữa tài liệu cũ và hiện trạng codebase, các đoạn mã tàn dư và những cạm bẫy kỹ thuật cần lưu ý để tránh "sửa nhầm" hoặc tạo lại mã thừa.

---

## 1. Tài Liệu Kế Hoạch Cũ (`notes.md`) Lệch Pha Thực Tế

Trong thư mục gốc có tệp `notes.md` được viết ở giai đoạn sơ khởi của dự án. Tệp này có nhiều mô tả **không còn phản ánh kiến trúc hiện tại**:

1. **Tệp cấu hình đã được module hóa**:
   - `notes.md` nhắc đến `src/config/constants.ts`.
   - **Thực tế**: Tệp này đã được chia tách thành hai tệp chuyên biệt:
     - `src/config/appConstants.ts` (dành cho Main process & cấu hình ứng dụng).
     - `src/config/frontendConstants.ts` (dành cho Renderer, thời gian timing và localStorage keys).
2. **Kiến trúc luồng Download đã thay đổi hoàn toàn**:
   - `notes.md` mô tả luồng: `Download.vue -> api.ts -> downloadService.ts -> DownloadManager.vue`.
   - **Thực tế**: Cả `api.ts` và `DownloadManager.vue` đều **không còn tồn tại**. Hệ thống hiện tại sử dụng kiến trúc IPC theo domain (`downloadIpc.ts`), Composable phản ứng `useDownloadQueue.ts` và chia nhỏ giao diện thành các card trong `src/renderer/src/components/download/`.
3. **Quy tắc cho AI Agent**:
   - Không đọc `notes.md` để suy diễn kiến trúc mã nguồn. Luôn lấy `.agents/rules/` và `.agents/context/` làm kim chỉ nam.
   - Tuyệt đối không tạo lại `api.ts` hay gộp lại `constants.ts`.

---

## 2. Mã Tàn Dư (Dead Code): `DOWNLOAD_SSE_RECONNECT`

- Trong `src/config/frontendConstants.ts` có hằng số:
  ```ts
  DOWNLOAD_SSE_RECONNECT: 5000
  ```
- **Nguồn gốc**: Tàn dư từ bản thử nghiệm thuở ban đầu khi ứng dụng dự định dùng mô hình máy chủ nội bộ HTTP + Server-Sent Events (SSE).
- **Hiện trạng**: Toàn bộ hệ thống đã chuyển dịch 100% sang cơ chế Push Event của Electron IPC (`webContents.send`). Hằng số này không còn nơi nào sử dụng.
- **Quy tắc**: Không gọi hằng số này trong bất kỳ code mới nào.

---

## 3. Cảnh Báo Lint `vue/no-v-html` trong `SettingsAboutCard.vue`

- **Vị trí**: `src/renderer/src/components/settings/SettingsAboutCard.vue` (dòng 111).
- **Hiện tượng**: ESLint cảnh báo về việc sử dụng trực tiếp chỉ thị `v-html`.
- **Nguyên nhân**: Dùng để render chuỗi giấy phép hoặc thông tin tác giả có chứa thẻ định dạng liên kết HTML.
- **Quy tắc**: Khi làm việc trên component này, nếu cần xử lý cảnh báo, hãy khử trùng (sanitize) hoặc chuyển sang các thẻ component Vue an toàn hơn thay vì chỉ tắt rule bằng `eslint-disable`. Tuyệt đối không đưa thêm `v-html` mới vào bất kỳ component nào khác.

---

## 4. Xung Đột Phiên Bản ABI Khi Chạy Vitest Trên Máy Phát Triển

- **Vấn đề**:
  - `better-sqlite3` và `realm` là các module C++ native addon, được cài đặt và build sẵn cho Electron 35 (`NODE_MODULE_VERSION 133`).
  - Khi lập trình viên hoặc AI agent chạy lệnh `npm run test` trực tiếp bằng Node.js của máy tính (thường là Node 22 - `NODE_MODULE_VERSION 137`), Node sẽ báo lỗi xung đột phiên bản binary tại:
    - `tests/services/database/databaseService.test.ts`
    - `tests/services/database/beatmapFilter.test.ts`
- **Cách CI/CD xử lý**:
  - Trên GitHub Actions (`.github/workflows/ci.yml`), pipeline chạy lệnh `npm rebuild better-sqlite3` trước khi chạy `npm run test:coverage`.
- **Cách AI Agent xử lý**:
  - Khi hoàn thành các tính năng không liên quan tới C++ native database (ví dụ sửa UI, i18n, pathGuards, downloader, updater...), hãy chạy các file test đơn vị tương ứng (ví dụ `npx vitest run tests/services/pathGuards.test.ts`).
  - Báo cáo rõ ràng kết quả cho người dùng, giải thích trạng thái ABI của 2 file test database nếu chúng bị ảnh hưởng trên môi trường Node cục bộ.

---

## 5. Bắt Lỗi Bất Đồng Bộ Phía Renderer (`unhandledrejection`)

- Hiện tại `src/renderer/src/main.ts` mới chỉ lắng nghe `window.addEventListener('error')` và `app.config.errorHandler` để báo cáo về Main qua `system:report-renderer-error`.
- Các Promise bị reject không bắt được (`unhandledrejection`) chưa có listener tự động.
- **Quy tắc**: Mọi lời gọi API IPC trả về Promise trong Composable và Component bắt buộc phải có khối `try/catch` bọc ngoài để xử lý lỗi thỏa đáng và hiển thị thông báo lỗi ra giao diện cho người dùng.
