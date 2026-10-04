---
trigger: always_on
---

# Core Rules — osu! Beatmap Backup

Electron 35 desktop app (Vue 3 + Vuetify renderer, Node main process, SQLite/Realm) để backup,
lọc và tải lại beatmap osu!. File này luôn được nạp: chỉ chứa **luật đỏ**, **bản đồ tài liệu**
và **Definition of Done**. Chi tiết nằm trong các file rule/context khác (nạp theo glob hoặc khi cần).

## 1. Luật đỏ (vi phạm = crash, mất dữ liệu, lỗ hổng, hoặc người dùng bị ban IP)

1. `src/main/index.ts`: dòng 1 **phải** là `import './initPortable'`. Không sắp xếp lại import,
   không để auto-organize-imports đụng vào file này.
2. Renderer (`src/renderer/**`) **không bao giờ** import `fs`, `path`, `child_process`, `electron`,
   `better-sqlite3`, `realm`, `electron-store` hay bất kỳ module nào trong `src/services/**` /
   `src/main/**` (ngoại trừ `import type`). Mọi I/O đi qua `window.electronAPI`.
3. Mọi `shell.openPath` / `shell.showItemInFolder` / `shell.openExternal` và mọi path ghép từ input
   phải đi qua `src/main/pathGuards.ts`.
4. Không đọc `osu!.db`, `collection.db`, `client.realm` khi chưa kiểm tra
   `isOsuProcessRunning(...)` → `.running === false`.
5. Không nới rate-limit mirror (hằng số `MINO_*`, `BEATCONNECT_*`, `DEFAULT_MIRROR_MAX_CONCURRENCY`
   trong `src/services/downloadService.ts`).
6. Ghi file dữ liệu người dùng (`.bbak`, snapshot hàng đợi, export) bằng `atomicWriteFile()`.
7. Không xoá script `postinstall`, không bỏ `external` native modules trong
   `electron.vite.config.ts`, không hạ ngưỡng coverage trong `vitest.config.ts` để "cho pass".
8. Không thêm Pinia/Vuex, TailwindCSS, axios, hay thư viện UI khác. Không thêm dependency mới nếu
   chưa hỏi người dùng.

## 2. Bản đồ tài liệu `.agents/`

| Khi nào                                     | Đọc                                  |
| :------------------------------------------ | :----------------------------------- |
| Bắt đầu task lạ / cần bức tranh tổng thể    | `.agents/context/overview.md`        |
| Cần tìm file nào làm gì                     | `.agents/context/directory-map.md`   |
| Lần theo luồng dữ liệu, IPC channel, event  | `.agents/context/data-flow.md`       |
| Gặp thuật ngữ osu! (beatmapset, .osz, MD5…) | `.agents/context/domain-glossary.md` |
| Trước khi "sửa luôn" thứ trông như bug cũ   | `.agents/context/known-gaps.md`      |
| Chạy test / verify / build / native ABI     | `.agents/rules/workflow-tests.md`    |
| Thêm IPC endpoint end-to-end                | skill `add-ipc-endpoint`             |
| Thêm / sửa chuỗi giao diện                  | skill `add-i18n-text`                |

Rule theo vùng code (tự nạp theo glob): `architecture`, `coding-style`, `main-ipc-preload`,
`services`, `renderer-vue`, `security-paths`, `downloads-mirrors`, `osu-data-access`, `i18n`.

## 3. Definition of Done (bắt buộc trước khi báo hoàn thành)

1. `npm run lint` → 0 error (không thêm warning mới).
2. `npm run typecheck` → pass cả `tsc` (node) lẫn `vue-tsc` (web).
3. Test liên quan pass; nếu sửa logic trong file có ngưỡng coverage → `npm run test:coverage`.
4. Nếu đổi chuỗi UI → cả `en.json`, `vi.json`, `ja.json` cùng key, cùng placeholder.
5. Báo cáo rõ: đã chạy lệnh gì, kết quả ra sao, test nào bị skip/fail vì native ABI (nếu có).

Toàn bộ quy trình: `npm run check` (= lint + typecheck + test:coverage). Shell mặc định của
người dùng là **PowerShell trên Windows**.
