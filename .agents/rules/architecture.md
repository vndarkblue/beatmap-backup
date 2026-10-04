---
trigger: glob
globs: src/**/*.ts,src/**/*.vue,electron.vite.config.ts
---

# Architecture & Module Boundaries

## 1. Bốn tầng và chiều phụ thuộc

```
src/renderer/src  (Vue 3, Chromium, KHÔNG có Node)
      │  window.electronAPI.<domain>.<method>()      ← chỉ đường này
src/preload       (contextBridge, typed bridge)
      │  ipcRenderer.invoke / ipcRenderer.on
src/main          (ipcMain.handle, window, lifecycle)
      │  gọi trực tiếp / EventEmitter
src/services      (business logic, SQLite, Realm, FS, HTTP, worker_threads)
      │
src/config, src/utils   (dùng chung, thuần TS, không phụ thuộc tầng trên)
```

Ma trận import được phép:

| Từ \ Đến         | renderer | preload           | main | services          | config / utils         |
| :--------------- | :------- | :---------------- | :--- | :---------------- | :--------------------- |
| **renderer**     | ✅       | `import type` chỉ | ❌   | `import type` chỉ | ✅ (chỉ file thuần TS) |
| **preload**      | ❌       | ✅                | ❌   | `import type` chỉ | ✅                     |
| **main**         | ❌       | `import type`     | ✅   | ✅                | ✅                     |
| **services**     | ❌       | `import type`     | ❌\* | ✅                | ✅                     |
| **config/utils** | ❌       | ❌                | ❌   | ❌                | ✅                     |

\* Service không import `src/main/**`. Ngoại lệ đã có: `logger.ts` và `updateService.ts` import
`isPortableMode` từ `src/main/portable.ts` — chấp nhận, không mở rộng thêm. Service được phép
import `electron` (API main-side như `app`, `safeStorage`, `shell`) vì chạy trong Main process.
`src/config/*` (thuần TS: `frontendConstants`, `beatmapMirrors`, …) và `src/utils/beatmapTitle.ts`
dùng được ở renderer. Lưu ý: renderer import `beatmapMirrors` nhận **bản sao module riêng** —
token Beatconnect runtime ở đó luôn rỗng phía renderer, đừng dựa vào nó.
`src/utils/fileUtils.ts` dùng `fs` → **chỉ** main/services. File mới trong `config/`/`utils/` mà
renderer dùng thì không được import module Node.

## 2. Điểm vào & build

- `electron.vite.config.ts` có 2 entry cho main: `index` (`src/main/index.ts`) và
  `stableImportWorker` (`src/services/workers/stableImportWorker.ts`). Thêm worker mới ⇒ thêm entry
  `rollupOptions.input` tương ứng, nếu không file worker sẽ không có trong `out/`.
- `external: ['realm', 'electron', 'electron-store', 'better-sqlite3']` cho main & preload — giữ nguyên.
- Renderer alias: `@renderer` → `src/renderer/src`. Global build-time: `__APP_VERSION__`.

## 3. Khởi động Main process (thứ tự là hợp đồng)

1. `import './initPortable'` → `setupPortableUserData()` đổi `userData` sang `data/` cạnh exe portable.
2. `logger.init()` ngay sau đó.
3. Các command-line switch tối ưu (disable-background-networking, `--max-old-space-size=256`, …).
4. Tạo `BrowserWindow` (frameless, `contextIsolation: true`, `nodeIntegration: false`).
5. `registerIpcHandlers(mainWindow)` → trả về teardown gộp; gọi khi window đóng.
6. `initEarlyServices()` rồi `startDeferredBackgroundServices()` (sync DB, updater, process watch)
   trong `src/main/backgroundServices.ts`; dừng bằng `stopBackgroundServices()`.

Không đưa tác vụ nặng (parse DB, mạng) vào trước khi window hiển thị — đặt vào deferred services.

## 4. State & persistence

- Không có store toàn cục: state sống trong composables (`useBackupWorkflow`, `useDownloadQueue`,
  `useDownloadSettings`, `useUpdater`). State dùng chung giữa component = biến `ref` cấp module
  trong composable.
- Settings bền vững: `electron-store` qua `src/services/settingsStore.ts`, truy cập từ renderer
  qua `window.electronAPI.settings.*`. Token Beatconnect mã hoá bằng `safeStorage` — renderer chỉ
  được biết `hasBeatconnectToken()`, không bao giờ đọc token thô.
- `localStorage` chỉ cho UI state/cache tạm, không lưu dữ liệu quan trọng hay bí mật.
- DB ứng dụng: `userData/beatmaps.db` (WAL, foreign keys, hàm `NORMALIZE_TEXT`).

## 5. Khi thêm tính năng mới — đặt code ở đâu

| Loại code                           | Vị trí                                                      |
| :---------------------------------- | :---------------------------------------------------------- |
| Logic nghiệp vụ, I/O, mạng          | `src/services/<domain>/…` (Singleton)                       |
| Mở kênh cho renderer                | `src/main/ipc/<domain>Ipc.ts` + `preload/index.ts` + types  |
| State/luồng UI                      | `src/renderer/src/composables/useXxx.ts`                    |
| UI                                  | `src/renderer/src/components/<domain>/PascalCase.vue`       |
| Hằng số app / UI                    | `src/config/appConstants.ts` / `frontendConstants.ts`       |
| Mirror mới                          | `src/config/beatmapMirrors.ts` (xem rule downloads-mirrors) |
| CPU-bound nặng (parse nhị phân lớn) | `src/services/workers/` + entry trong electron.vite config  |

Không tạo lại các file đã bị loại bỏ: `src/config/constants.ts`, `api.ts`, `DownloadManager.vue`,
hay bất kỳ cơ chế HTTP server/SSE nội bộ nào.
