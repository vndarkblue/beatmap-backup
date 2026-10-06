# Architectural & Convention Digest: Beatmap Backup

Bản tóm tắt súc tích về kiến trúc, công nghệ, quy ước lập trình, các cạm bẫy và quy trình phát triển của dự án **osu! Beatmap Backup**.

---

## 1. Tech Stack & Thư viện Cốt lõi

### Nền tảng Desktop & Build System

- **Electron 35.1.5 (Node 22, ABI 133):** Kiến trúc đa tiến trình chuẩn (Main, Preload, Renderer). Cửa sổ frameless (`frame: false`), bật `contextIsolation: true`, tắt `nodeIntegration: false`, tắt `sandbox: false`.
- **electron-vite 3.1.0 & Vite 6.2.6:** Bundler tối ưu hóa riêng cho Electron, tách biệt cấu hình build cho `main`, `preload`, và `renderer`.
- **electron-builder 25.1.8:** Đóng gói ứng dụng cho Windows (NSIS Installer & Portable), Linux (AppImage, snap, deb), macOS (dmg). Cấu hình lọc chỉ giữ locale cần thiết (`en-US`, `vi`, `ja`) và bật nén cực đại (`compression: maximum`) để giảm tối đa kích thước gói cài đặt.
- **electron-store 8.1.0 & safeStorage:** Lưu trữ cấu hình người dùng; dùng API `safeStorage` của Electron mã hóa token nhạy cảm (Beatconnect API token).

### Frontend & UI

- **Vue 3.5.13:** Sử dụng hoàn toàn **Composition API** với cú pháp `<script setup lang="ts">`.
- **Vue Router 4.5.1:** Sử dụng chế độ hash (`createWebHashHistory`) để tương thích với giao thức `file://` của Electron.
- **Vuetify 3.8.7:** Thư viện giao diện chính (Material Design 3), hỗ trợ dark/light theme, tùy biến palette màu.
- **Icon System:** `@mdi/js` và `vuetify/iconsets/mdi-svg` (dùng icon SVG tree-shakeable thông qua alias nội bộ, không tải webfont cồng kềnh).
- **Vue I18n 11.1.5:** Hỗ trợ 3 ngôn ngữ: Tiếng Anh (`en`), Tiếng Nhật (`ja`), Tiếng Việt (`vi`).
- **SimpleBar Vue 2.4.1:** Thanh cuộn tùy biến giao diện nhất quán đa nền tảng.
- **Không dùng TailwindCSS:** Toàn bộ CSS là scoped CSS và token tùy biến trong `src/renderer/src/assets/main.css`.

### State Management

- **Không dùng Vuex hay Pinia:** Quản lý state dựa trên **Vue 3 Composables** (`useBackupWorkflow`, `useDownloadQueue`, `useDownloadSettings`, `useUpdater`).
- **Persistence:** Kết hợp giữa `localStorage` trên Renderer (cho UI state/cache tức thời) và IPC đồng bộ với `electron-store` trên Main Process.

### Database, File Parsing & Networking

- **better-sqlite3 12.9.0:** Cơ sở dữ liệu SQLite cục bộ (lưu tại `userData/beatmaps.db`), kích hoạt WAL mode (`journal_mode = WAL`), foreign keys, và đăng ký hàm custom `NORMALIZE_TEXT` cho tìm kiếm không dấu / Unicode.
- **realm 12.6.0:** Đọc trực tiếp database `client.realm` của osu!lazer ở chế độ read-only thông qua dynamic schema inspection.
- **osu-db-parser 2.0.1:** Đọc và parse nhị phân file `osu!.db` của osu!stable.
- **p-queue 8.1.0 & Native HTTP/HTTPS streams:** Engine tải xuống beatmap đa luồng, hỗ trợ luồng stream ghi trực tiếp vào đĩa, kiểm tra CRC/hash và metadata của file `.osz`.

### Testing & Code Quality

- **Vitest 4.0.1 & @vitest/coverage-v8:** Unit và Integration testing trong môi trường Node. Có ngưỡng coverage tối thiểu (`thresholds`) quy định cụ thể trong [vitest.config.ts](file:///d:/coding/osu-beatmap-backup/vitest.config.ts).
- **ESLint 9.24.0 (Flat config):** Tích hợp quy chuẩn TypeScript, Vue 3 (`flat/recommended`), và Prettier.
- **Prettier 3:** Single quote, không chấm phẩy (`semi: false`), không trailing comma, printWidth 100.
- **Dual Typecheck:** Kết hợp `tsc` cho tiến trình Node/Main/Preload và `vue-tsc` cho Renderer.

---

## 2. Quy ước Kiến trúc & Thư mục

### Phân tầng Quy trình (Process Boundaries)

```
[Renderer (Vue 3)]
       ↕ window.electronAPI (Strict Typed Bridge)
[Preload (contextBridge)]
       ↕ IPC (ipcRenderer ↔ ipcMain)
[Main Process (Node.js)]
       ↕ Direct Calls / EventEmitter
[Services / SQLite / Realm / File System]
```

### Tổ chức Thư mục

- `src/main/`: Tiến trình Main.
  - [initPortable.ts](file:///d:/coding/osu-beatmap-backup/src/main/initPortable.ts) & [portable.ts](file:///d:/coding/osu-beatmap-backup/src/main/portable.ts): Thiết lập chế độ chạy portable và chuyển hướng thư mục `userData`.
  - [pathGuards.ts](file:///d:/coding/osu-beatmap-backup/src/main/pathGuards.ts): Lớp bảo vệ chống Path Traversal và kiểm tra URL an toàn.
  - [windowState.ts](file:///d:/coding/osu-beatmap-backup/src/main/windowState.ts): Lưu và khôi phục tọa độ, kích thước cửa sổ.
  - [backgroundServices.ts](file:///d:/coding/osu-beatmap-backup/src/main/backgroundServices.ts): Quản lý vòng đời các tác vụ chạy nền (sync DB định kỳ, tự động cập nhật, kiểm tra tiến trình osu!).
  - `ipc/`: Đăng ký IPC theo từng domain (`backupIpc`, `databaseIpc`, `downloadIpc`, `settingsIpc`, `systemIpc`, `updaterIpc`).
- `src/preload/`:
  - [index.ts](file:///d:/coding/osu-beatmap-backup/src/preload/index.ts): Định nghĩa `electronAPI` phơi bày qua `contextBridge`.
  - [electronApiTypes.ts](file:///d:/coding/osu-beatmap-backup/src/preload/electronApiTypes.ts): Định nghĩa kiểu dữ liệu duy nhất cho API giao tiếp giữa Main và Renderer.
- `src/services/`: Nghiệp vụ lõi (chạy trên Main process).
  - `database/`: Quản lý SQLite (`databaseService`), schema & migration, filter query, đồng bộ dữ liệu (`syncManager`), importer cho Stable và Lazer.
  - `collection/`: Phân tích và trích xuất collection từ cả Stable (`collection.db`) và Lazer (`client.realm`), mapping MD5 sang beatmapset ID.
  - `download/`: Downloader HTTP stream, kiểm tra tính toàn vẹn `.osz`, quản lý snapshot hàng đợi (`queuePersistence`).
  - [logger.ts](file:///d:/coding/osu-beatmap-backup/src/services/logger.ts): Hệ thống ghi log xoay vòng (rotating file 2MB), ring-buffer trong RAM và chụp snapshot chẩn đoán.
- `src/renderer/src/`:
  - `components/`: Chia theo domain tính năng (`backup/`, `download/`, `filter/`, `settings/`, `layout/`, `common/`).
  - `composables/`: Quản lý state và luồng người dùng (`useBackupWorkflow`, `useDownloadQueue`, v.v.).
  - `i18n/`: Cấu hình đa ngôn ngữ và các file từ điển json (`locales/`).
- `src/config/`: Cấu hình dùng chung (`appConstants.ts`, `frontendConstants.ts`, `beatmapMirrors.ts`).
- `src/utils/`: Tiện ích đa môi trường ([fileUtils.ts](file:///d:/coding/osu-beatmap-backup/src/utils/fileUtils.ts) cho atomic file write, `beatmapTitle.ts`, `env.ts`).
- `tests/`: Phản chiếu cấu trúc thư mục của `src/` (`tests/main/`, `tests/services/`, `tests/renderer/`, `tests/config/`).

### Luồng Dữ liệu (Data Flow)

1. **Request - Response (Kéo dữ liệu):**
   - UI gọi hàm trong Composable -> Composable gọi `window.electronAPI.<domain>.<method>()` -> `ipcRenderer.invoke('<domain>:<action>')` -> Main process `ipcMain.handle()` gọi Service Singleton tương ứng -> Trả về kết quả Promise.
2. **Push Event / Streaming (Đẩy dữ liệu từ nền):**
   - Service kế thừa `EventEmitter` (ví dụ `DownloadService`, `SyncManager`).
   - IPC module lắng nghe sự kiện từ Service và bắn qua `mainWindow.webContents.send('<channel>', data)`.
   - Preload cung cấp hàm `onEvent(listener)` trả về một hàm hủy đăng ký (`unsubscribe callback`).
   - Vue Composable đăng ký listener trong lifecycle hook (`onMounted`) và tự động gọi `unsubscribe()` khi hủy component (`onBeforeUnmount`).

---

## 3. Code Conventions & Best Practices

### Style Guide & TypeScript

- **Tên file:**
  - Vue Components: PascalCase (ví dụ: `DownloadActiveTable.vue`, `BackupCollectionsCard.vue`).
  - TypeScript modules/services/composables: camelCase (ví dụ: `downloadService.ts`, `useDownloadQueue.ts`).
  - Kiểu dữ liệu hoặc Schema: camelCase hoặc PascalCase tùy bối cảnh (`types.ts`, `schema.ts`).
- **Prettier Rules:**
  - Thụt đầu dòng: 2 spaces.
  - Không dùng dấu chấm phẩy cuối dòng (`semi: false`).
  - Dùng nháy đơn (`singleQuote: true`).
  - Không dùng trailing comma (`trailingComma: none`).
  - Độ rộng dòng: tối đa 100 ký tự (`printWidth: 100`).
- **Vue SFC Standards:**
  - Bắt buộc khai báo `<script setup lang="ts">`. Quy tắc này được ép chặt bởi ESLint (`vue/block-lang`).
  - Thứ tự khối chuẩn trong component: `<template>` -> `<script setup lang="ts">` -> `<style scoped>` (nếu có).
  - Tránh đặt style toàn cục trong các component nhỏ; chỉ dùng CSS scoped hoặc các class tiện ích của Vuetify.

### Quy ước Thiết kế Service & IPC

- **Service Singleton:** Mọi Service trong `src/services/` đều áp dụng mẫu Singleton thông qua phương thức tĩnh `getInstance()` (hoặc object hằng số xuất khẩu như `realmService`) và constructor ở trạng thái `private`.
- **Kênh IPC có định danh theo domain:** Quy chuẩn đặt tên kênh là `<domain>:<action>` (ví dụ: `database:get-status`, `system:open-path`, `download:push-event`).
- **Hủy đăng ký IPC sạch sẽ (Teardown):** Mọi hàm `register...Ipc()` trong `src/main/ipc/` phải trả về một callback hủy toàn bộ handler và listener khi cửa sổ đóng để tránh memory leak.
- **An toàn tuần tự hóa qua IPC:** Dữ liệu phức tạp (như filter object) trước khi gửi qua IPC hoặc lưu vào SQLite cần được serialize/clone sạch (`JSON.parse(JSON.stringify(payload))`) để tránh prototype-pollution hoặc lỗi clone object của Electron.

### Ghi Log & Xử lý Lỗi

- **Ghi log tập trung:** Sử dụng `logger` từ [logger.ts](file:///d:/coding/osu-beatmap-backup/src/services/logger.ts) thay vì `console.log` thuần túy ở các luồng trọng yếu.
- **Bắt lỗi giao diện:** Renderer có `app.config.errorHandler` và listener sự kiện `window.addEventListener('error')`, chuyển tiếp toàn bộ lỗi chưa bắt được về Main process qua IPC `system:report-renderer-error` để ghi vào file log ứng dụng.
- **Ghi đĩa an toàn (Atomic Writes):** Mọi thao tác lưu file backup (`.bbak`), file snapshot hàng đợi, hay file export local beatmap bắt buộc phải thông qua `atomicWriteFile()` (ghi vào file `.tmp` trước rồi mới `rename`) để loại bỏ hoàn toàn nguy cơ hỏng file khi bị ngắt đột ngột.

---

## 4. Các Cạm Bẫy Thường Gặp & Những Điều Tuyệt Đối KHÔNG Được Làm

> [!CAUTION]
> Các quy tắc dưới đây là bất khả xâm phạm đối với toàn bộ codebase này. Vi phạm sẽ dẫn đến crash ứng dụng, mất dữ liệu người dùng hoặc hỏng cấu trúc bảo mật.

1. **TUYỆT ĐỐI KHÔNG can thiệp thứ tự import trong `src/main/index.ts`:**
   - Dòng đầu tiên của `src/main/index.ts` bắt buộc phải là `import './initPortable'`.
   - _Lý do:_ Module này kích hoạt `setupPortableUserData()`, trỏ thư mục `userData` về thư mục `data/` cạnh file thực thi portable trước khi bất kỳ module nào khác (như `electron-store`) kịp khởi tạo. Nếu đảo thứ tự import, dữ liệu người dùng portable sẽ bị ghi đè vào `%APPDATA%`.
2. **TUYỆT ĐỐI KHÔNG import trực tiếp module của Main/Node vào Renderer:**
   - Không bao giờ `import` các thư viện Node.js (`fs`, `path`, `child_process`), Native Addons (`better-sqlite3`, `realm`), hay `electron` vào trong `src/renderer/`.
   - Mọi tương tác đĩa, mạng hay hệ thống đều phải đi qua `window.electronAPI`.
3. **TUYỆT ĐỐI KHÔNG bypass lớp bảo vệ `pathGuards.ts`:**
   - Khi mở đường dẫn thư mục, mở file trên hệ điều hành (`shell.openPath`, `shell.showItemInFolder`) hoặc mở trình duyệt (`shell.openExternal`), bắt buộc phải kiểm tra thông qua `isSafeDirectoryToOpen()`, `isSafePathToShow()`, `isValidExternalUrl()`.
   - Khi thao tác đường dẫn con, phải dùng `safeJoinWithinRoot()` để triệt tiêu lỗ hổng Path Traversal (`../`).
4. **TUYỆT ĐỐI KHÔNG truy cập database của osu! khi game đang chạy:**
   - Luôn kiểm tra `isOsuProcessRunning('stable')` hoặc `isOsuProcessRunning('lazer')` trước khi parse `osu!.db` hoặc `client.realm`.
   - Đọc/ghi đồng thời với osu! có thể gây khóa cơ sở dữ liệu (file lock), sai lệch dữ liệu hoặc làm crash trò chơi của người dùng.
5. **CẨN THẬN Xung đột phiên bản ABI của Native Addon (NODE_MODULE_VERSION Mismatch):**
   - `better-sqlite3` và `realm` được build theo ABI của Electron 35 (`NODE_MODULE_VERSION 133`).
   - Khi chạy `vitest` bằng Node.js máy chủ (ví dụ Node 22 - ABI 137), các test load trực tiếp `better-sqlite3` native binary sẽ thất bại nếu binary chưa được build lại cho Node hoặc thiếu mock. Không tùy tiện xóa script `postinstall` hay cấu hình external native modules trong `electron.vite.config.ts`.
6. **TUYỆT ĐỐI KHÔNG phá vỡ giới hạn tốc độ (Rate Limit) của các Beatmap Mirror:**
   - Không tự ý tăng concurrency hoặc xóa bỏ dispatch interval:
     - Mirror Mino (`catboy.best`): Concurrency tối đa là 2 luồng, giãn cách tối thiểu 600ms, không vượt quá 60 request/phút.
     - Mirror Beatconnect: Tối đa 5 luồng nếu có API Token hợp lệ, chỉ được chạy tối đa 2 luồng và giãn cách 800ms nếu chưa xác thực.
   - Vi phạm sẽ dẫn đến việc IP người dùng bị cấm vĩnh viễn trên các mirror server.
7. **KHÔNG sửa đổi code các file có test coverage mà không cập nhật test tương ứng:**
   - `vitest.config.ts` thiết lập ngưỡng statement/branch coverage cứng cho:
     - `src/config/beatmapMirrors.ts` (95% / 95%)
     - `src/services/beatmapMirrorService.ts` (90% / 75%)
     - `src/services/database/databaseService.ts` (85% / 57%)
     - `src/services/download/queuePersistence.ts` (90% / 85%)
     - `src/services/download/httpDownloader.ts` (60% / 40%)
     - `src/main/pathGuards.ts` (87% / 84%)
   - Bất kỳ thay đổi logic nào làm giảm độ phủ dưới các ngưỡng này đều sẽ khiến lệnh `npm run check` bị fail.

---

## 5. Quy trình Lệnh Chuẩn Xác (Build / Test / Run)

Tất cả các lệnh phải được chạy từ thư mục gốc của repository:

| Mục đích                              | Lệnh chuẩn                                    | Ghi chú kỹ thuật                                                                  |
| :------------------------------------ | :-------------------------------------------- | :-------------------------------------------------------------------------------- |
| **Chạy môi trường Dev**               | `npm run dev`                                 | Khởi chạy Vite dev server cho Renderer và chạy Electron với tính năng Hot-Reload. |
| **Kiểm tra kiểu dữ liệu (Toàn diện)** | `npm run typecheck`                           | Chạy đồng thời `typecheck:node` (`tsc`) và `typecheck:web` (`vue-tsc`).           |
| **Kiểm tra Lint**                     | `npm run lint`                                | Chạy `eslint --cache .` với Flat Config.                                          |
| **Tự động format code**               | `npm run format`                              | Chạy `prettier --write .`                                                         |
| **Chạy Unit/Integration Tests**       | `npm run test`                                | Chạy toàn bộ test suites bằng `vitest run`.                                       |
| **Chạy Test kèm Coverage**            | `npm run test:coverage`                       | Kiểm tra độ phủ mã nguồn theo ngưỡng quy định tại `vitest.config.ts`.             |
| **Kiểm tra toàn diện trước Commit**   | `npm run check`                               | Chạy liên hoàn: `npm run lint && npm run typecheck && npm run test:coverage`.     |
| **Build mã nguồn ứng dụng**           | `npm run build`                               | Thực hiện `typecheck` và build bundles qua `electron-vite build`.                 |
| **Đóng gói Windows (NSIS Installer)** | `npm run build:win`                           | Build mã nguồn và đóng gói bộ cài đặt `Setup.exe`.                                |
| **Đóng gói Windows (Bản Portable)**   | `npm run build:portable`                      | Tạo file `.exe` di động độc lập (tự tạo thư mục `data/` chứa dữ liệu).            |
| **Đóng gói Linux / macOS**            | `npm run build:linux` / `npm run build:mac`   | Tạo AppImage, deb, snap hoặc dmg.                                                 |
| **Cài đặt dependencies native**       | `npm run postinstall`                         | Tự động gọi `electron-builder install-app-deps`.                                  |
| **Rebuild native module khi cần**     | `npm run rebuild:native`                      | Build lại `better-sqlite3` từ source cho Electron bằng `electron-rebuild`.        |
| **Xuất / Nhập CSV dịch i18n**         | `npm run i18n:export` / `npm run i18n:import` | Đồng bộ file ngôn ngữ JSON với bảng dữ liệu CSV.                                  |

---

## 6. Các Điểm Chưa Đồng Bộ & Tồn Đọng (Desynchronizations & Gaps)

1. **Tài liệu quy hoạch `notes.md` bị lệch pha so với kiến trúc thực tế:**
   - `notes.md` vẫn nhắc đến file `src/config/constants.ts` (thực tế đã được module hóa thành [appConstants.ts](file:///d:/coding/osu-beatmap-backup/src/config/appConstants.ts) và [frontendConstants.ts](file:///d:/coding/osu-beatmap-backup/src/config/frontendConstants.ts)).
   - `notes.md` mô tả luồng `Download.vue -> api.ts -> downloadService.ts -> DownloadManager.vue`. Trên thực tế, `api.ts` và `DownloadManager.vue` không còn tồn tại; hệ thống đã chuyển dịch sang IPC domain-driven và composable [useDownloadQueue.ts](file:///d:/coding/osu-beatmap-backup/src/renderer/src/composables/useDownloadQueue.ts) kết hợp với các card thành phần trong `components/download/`.
   - Cần tái cấu trúc lại tài liệu kiến trúc dựa theo digest này.
2. **Cảnh báo Lint `vue/no-v-html`:**
   - File [SettingsAboutCard.vue](file:///d:/coding/osu-beatmap-backup/src/renderer/src/components/settings/SettingsAboutCard.vue#L111) kích hoạt 1 cảnh báo lint về việc sử dụng trực tiếp chỉ thị `v-html` (tiềm ẩn nguy cơ XSS nếu nội dung không được khử trùng).
3. **Môi trường Test Native Module trên Host:**
   - Khi `better-sqlite3` được build theo target Electron (`NODE_MODULE_VERSION 133`), chạy `vitest` trực tiếp trên host Node 22 (`NODE_MODULE_VERSION 137`) sẽ gặp lỗi phiên bản module ở 2 file test cơ sở dữ liệu (`databaseService.test.ts` và `beatmapFilter.test.ts`). Các test khác (không nạp binary C++) vẫn pass 100%. Cần cấu hình test runner hoặc mock tầng binary phù hợp cho môi trường CI/CD thuần Node.
