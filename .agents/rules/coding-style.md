---
trigger: glob
globs: src/**/*.ts,src/**/*.vue,tests/**/*.ts,*.config.ts,*.mjs
---

# Coding Style & Conventions

Nguồn sự thật: `.prettierrc.yaml`, `eslint.config.mjs`, `.editorconfig`. Khi nghi ngờ → chạy
`npm run format` rồi `npm run lint`, đừng tự đoán.

## 1. Formatting (Prettier 3)

- 2 spaces, **không chấm phẩy**, **nháy đơn**, **không trailing comma**, `printWidth: 100`.
- Không reformat file ngoài phạm vi task (giữ diff nhỏ). Chỉ format file mình sửa:
  `npx prettier --write <file>`.
- Line ending của repo lẫn CRLF/LF — giữ nguyên kiểu đang có của từng file.

## 2. TypeScript

- Lint dùng `@electron-toolkit/eslint-config-ts` (recommended): **khai báo kiểu trả về tường minh**
  cho function/arrow được export hoặc là callback có tên, ví dụ
  `const onTaskAdded = (task: DownloadTask): void => …`, `export function x(): Promise<void>`.
- Không dùng `any`. Dữ liệu chưa rõ → `unknown` rồi thu hẹp; ép kiểu qua
  `as unknown as T` chỉ khi ở ranh giới IPC/thư viện và có lý do.
- Dùng `import type { … }` cho import chỉ có kiểu — **bắt buộc** khi import từ `services/` hay
  `preload/` vào renderer.
- Ưu tiên union string literal (`'stable' | 'lazer'`) thay vì enum mới; enum đã có
  (`DownloadEvent`) thì giữ.
- Promise không await phải ghi rõ ý đồ bằng `void promise` (pattern đã dùng trong codebase).
- Hằng số magic (timeout, giới hạn, key storage) → `src/config/appConstants.ts` (main) hoặc
  `src/config/frontendConstants.ts` (renderer, `STORAGE_KEYS`, `FRONTEND_TIMINGS_MS`, …).

## 3. Đặt tên

| Thứ                       | Quy ước                          | Ví dụ                                            |
| :------------------------ | :------------------------------- | :----------------------------------------------- |
| Vue component             | PascalCase `.vue`                | `DownloadActiveTable.vue`                        |
| Component con theo domain | Prefix theo domain               | `BackupSourcesCard.vue`, `SettingsXxxCard`       |
| Module TS / service       | camelCase `.ts`                  | `downloadService.ts`, `pathGuards.ts`            |
| Composable                | `useXxx.ts`, export `useXxx`     | `useDownloadQueue.ts`                            |
| IPC module                | `<domain>Ipc.ts`                 | `databaseIpc.ts` → `registerDatabaseIpc`         |
| IPC channel               | `<domain>:<kebab-action>`        | `database:get-status`                            |
| Push channel              | `<domain>:<noun>-event/progress` | `download:push-event`, `database:sync-progress`  |
| Hằng số                   | `UPPER_SNAKE_CASE`               | `MINO_MAX_CONCURRENCY`                           |
| Test                      | `<module>.test.ts` mirror `src/` | `tests/services/download/httpDownloader.test.ts` |

## 4. Vue SFC

- **Bắt buộc** `<script setup lang="ts">` (ESLint `vue/block-lang` = error). Không Options API.
- Thứ tự khối: `<template>` → `<script setup lang="ts">` → `<style scoped>`.
- Style: `scoped` hoặc utility class của Vuetify; token màu/biến dùng chung đặt ở
  `src/renderer/src/assets/main.css`. Không style global trong component nhỏ.
- `defineProps`/`defineEmits` dùng generic type (`defineProps<{ … }>()`).
- Không `v-html` (đang có 1 warning tồn đọng — xem `context/known-gaps.md`; không thêm cái mới).
- Icon: dùng alias Vuetify dạng `$tenAlias` (vd `icon="$download"`, `<v-icon icon="$folderOpen" />`).
  Alias được khai báo tập trung trong `appIconAliases` ở `src/renderer/src/main.ts` bằng path SVG
  từ `@mdi/js`. Cần icon mới ⇒ import `mdiXxx` và thêm alias ở đó. Không dùng chuỗi `mdi-xxx`
  (webfont) và không import `@mdi/font` CSS.

## 5. Comment & log

- Giữ nguyên comment/docstring có sẵn không liên quan tới thay đổi.
- Comment giải thích **vì sao**, không diễn lại code. Tiếng Anh trong source code.
- Không `console.log` trong main/services — dùng `logger` (`src/services/logger.ts`).
  Renderer: lỗi chưa bắt sẽ tự chuyển về main qua `system:report-renderer-error`.
