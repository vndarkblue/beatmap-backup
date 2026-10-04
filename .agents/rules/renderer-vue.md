---
trigger: glob
globs: src/renderer/**/*.ts,src/renderer/**/*.vue,src/renderer/**/*.css,src/renderer/index.html
---

# Renderer (Vue 3 + Vuetify 3)

Renderer chạy trong Chromium với `contextIsolation`, **không có Node**. Thứ duy nhất nối ra ngoài
là `window.electronAPI` (kiểu `ElectronApi` từ `src/preload/electronApiTypes.ts`).

## 1. Cấm tuyệt đối

- Import `electron`, `fs`, `path`, `os`, `child_process`, `better-sqlite3`, `realm`,
  `electron-store`, `src/utils/fileUtils.ts`, hay bất kỳ module runtime nào từ `src/services/**`,
  `src/main/**`. Chỉ `import type` (vd
  `import type { DownloadTask } from '../../../preload/electronApiTypes'`).
- Dùng `window.electron` / `window.api` (di sản của template, không dùng cho tính năng mới).
- Pinia/Vuex, TailwindCSS, thư viện UI/HTTP khác, gọi `fetch` trực tiếp tới mirror/osu! API
  (mạng đi qua main process).
- `v-html` với dữ liệu không kiểm soát.

## 2. Composables = state management

- Mỗi luồng nghiệp vụ một composable trong `src/renderer/src/composables/useXxx.ts`, export
  `function useXxx(): UseXxxReturn` với **interface trả về tường minh** (xem
  `UseDownloadQueueReturn`).
- State (`ref`, buffer, `Map` index, biến `unsubscribe`) được tạo **bên trong** hàm `useXxx()` — mỗi
  lần gọi là một instance mới. Vì vậy composable luồng chính chỉ được gọi **một lần ở view
  sở hữu** (vd `useDownloadQueue()` chỉ trong `Download.vue`) rồi truyền xuống card con qua
  props/emit. Không gọi lại `useDownloadQueue()` trong component con (sẽ tạo state + subscription
  thứ hai). Chỉ đưa state lên cấp module khi thật sự cần singleton toàn app và ghi comment lý do.
- Luồng có state phức tạp / event push (backup, download queue, updater) → IPC nằm trong composable.
  Gọi `window.electronAPI` trực tiếp trong component chỉ chấp nhận cho thao tác đơn lẻ, không
  state (mở thư mục, đọc version, window controls…) — đã có trong `Settings*Card`, `AppTitlebar`.
- Luôn `try/catch` quanh lời gọi IPC; hiển thị lỗi qua UI (snackbar/alert) với chuỗi i18n.

## 3. Đăng ký event push (chống memory leak)

```ts
let unsubscribe: (() => void) | null = null
const connect = async (): Promise<void> => {
  if (unsubscribe) return // idempotent
  const initial = await window.electronAPI.download.getTasks() // lấy snapshot trước
  apply(initial)
  unsubscribe = window.electronAPI.download.onEvent(handlePush)
}
const disconnect = (): void => {
  unsubscribe?.()
  unsubscribe = null
}
```

Component gọi `connect()` trong `onMounted` và `disconnect()` trong `onBeforeUnmount`. Không bao giờ
đăng ký `onXxx` mà bỏ qua giá trị unsubscribe trả về.

## 4. Hiệu năng UI (danh sách có thể hàng chục nghìn beatmap/task)

- Gom cập nhật từ push event vào buffer + flush theo timer/`requestAnimationFrame` (pattern
  `pendingTaskUpdates` + `scheduleDownloadStateFlush` trong `useDownloadQueue.ts`).
- Giới hạn số dòng render (`MAX_RENDERED_DOWNLOAD_ROWS = 600`) hoặc dùng virtual/paginated table.
- Tra cứu theo id bằng `Map` index, không `Array.find` trong vòng lặp nóng.
- Mảng/object lớn không cần reactive sâu → `shallowRef` / thay cả mảng thay vì mutate từng phần tử.
- Payload gửi qua IPC lấy từ reactive state: truyền dữ liệu thuần (`toRaw` hoặc clone), không gửi
  Proxy.

## 5. Component & layout

- Cấu trúc: view cấp cao ở `components/*.vue` (`Backup.vue`, `Download.vue`, `BeatmapFilter.vue`,
  `Settings.vue`) → card/phần con trong `components/<domain>/`. Component tái dùng chung →
  `components/common/` (`AppForm`, `AppIsland`, `AppViewShell`, `PathField`).
- Router: `createWebHashHistory` trong `src/renderer/src/router.ts` — **không** đổi sang history
  mode (vỡ với `file://`).
- Vuetify components auto-import (`vite-plugin-vuetify`); theme light/dark & palette khai báo
  trong `src/renderer/src/main.ts`, token CSS ở `assets/main.css`, font Torus trong `assets/fonts`.
- Icon: alias `$name` khai báo trong `appIconAliases` (`main.ts`).
- Thanh cuộn tuỳ biến: `simplebar-vue`.
- Phiên bản app hiển thị: global `__APP_VERSION__`.
- `localStorage` key phải lấy từ `STORAGE_KEYS` / `THEME_PREF_KEY` trong
  `src/config/frontendConstants.ts`; bọc `try/catch` khi đọc.

## 6. Lỗi

`main.ts` đã gắn `app.config.errorHandler` + `window.addEventListener('error')`
→ `window.electronAPI.system.reportRendererError(...)` (kênh fire-and-forget
`system:report-renderer-error`, ghi vào log file của main). Không gỡ cơ chế này; không nuốt lỗi
im lặng. (Chưa có listener `unhandledrejection` — nên `catch` mọi promise IPC.)

## 7. i18n

Mọi chuỗi hiển thị dùng `t('…')` / `$t('…')`. Chi tiết: rule `i18n` + skill `add-i18n-text`.
