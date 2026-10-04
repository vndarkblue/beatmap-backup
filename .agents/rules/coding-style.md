---
trigger: glob
globs: src/**/*.ts,src/**/*.vue,tests/**/*.ts,*.config.ts,*.mjs
---

# Coding Style & Conventions

Sources of truth: `.prettierrc.yaml`, `eslint.config.mjs`, `.editorconfig`. When in doubt, run
`npm run format` then `npm run lint`; do not guess.

## 1. Formatting (Prettier 3)

- 2 spaces, **no semicolons**, **single quotes**, **no trailing comma**, `printWidth: 100`.
- Do not reformat files outside the task scope (keep diffs minimal). Format modified files only:
  `npx prettier --write <file>`.
- Repository line endings are mixed CRLF/LF — preserve the existing line endings of each file.

## 2. TypeScript

- Linting uses `@electron-toolkit/eslint-config-ts` (recommended): **explicit return types are required**
  for exported functions, arrow functions, or named callbacks, e.g.,
  `const onTaskAdded = (task: DownloadTask): void => …`, `export function x(): Promise<void>`.
- Do not use `any`. For uncertain data, use `unknown` then narrow down; type casting via
  `as unknown as T` is only permissible at IPC or library boundaries with justification.
- Use `import type { … }` for type-only imports — **mandatory** when importing from `services/` or
  `preload/` into the renderer.
- Prefer string literal unions (`'stable' | 'lazer'`) over creating new enums; preserve existing enums
  (`DownloadEvent`).
- Unawaited promises must explicitly indicate intent using `void promise` (established codebase pattern).
- Magic constants (timeouts, limits, storage keys) belong in `src/config/appConstants.ts` (main) or
  `src/config/frontendConstants.ts` (renderer, `STORAGE_KEYS`, `FRONTEND_TIMINGS_MS`, …).

## 3. Naming Conventions

| Item                      | Convention                       | Example                                          |
| :------------------------ | :------------------------------- | :----------------------------------------------- |
| Vue component             | PascalCase `.vue`                | `DownloadActiveTable.vue`                        |
| Domain subcomponent       | Prefixed by domain               | `BackupSourcesCard.vue`, `SettingsXxxCard`       |
| TS module / service       | camelCase `.ts`                  | `downloadService.ts`, `pathGuards.ts`            |
| Composable                | `useXxx.ts`, export `useXxx`     | `useDownloadQueue.ts`                            |
| IPC module                | `<domain>Ipc.ts`                 | `databaseIpc.ts` → `registerDatabaseIpc`         |
| IPC channel               | `<domain>:<kebab-action>`        | `database:get-status`                            |
| Push channel              | `<domain>:<noun>-event/progress` | `download:push-event`, `database:sync-progress`  |
| Constant                  | `UPPER_SNAKE_CASE`               | `MINO_MAX_CONCURRENCY`                           |
| Test                      | `<module>.test.ts` mirroring `src/` | `tests/services/download/httpDownloader.test.ts` |

## 4. Vue Single File Components (SFC)

- **Mandatory** `<script setup lang="ts">` (ESLint `vue/block-lang` = error). No Options API.
- Block order: `<template>` → `<script setup lang="ts">` → `<style scoped>`.
- Styling: `scoped` CSS or Vuetify utility classes; shared color tokens and CSS variables belong in
  `src/renderer/src/assets/main.css`. No global styling in small components.
- `defineProps`/`defineEmits` must use TypeScript generic syntax (`defineProps<{ … }>()`).
- Do not use `v-html` (there is 1 existing warning — see `context/known-gaps.md`; do not introduce new ones).
- Icons: use Vuetify aliases formatted as `$aliasName` (e.g., `icon="$download"`, `<v-icon icon="$folderOpen" />`).
  Aliases are declared centrally in `appIconAliases` in `src/renderer/src/main.ts` using SVG path data
  from `@mdi/js`. When a new icon is needed: import `mdiXxx` and add the alias there. Do not use `mdi-xxx`
  webfont strings and do not import `@mdi/font` CSS.

## 5. Comments & Logging

- Preserve existing comments and docstrings that are unrelated to your code changes.
- Comments must explain **why**, not repeat what the code does. Use English in source code.
- No `console.log` in main or services — use `logger` (`src/services/logger.ts`).
  Renderer: uncaught errors are automatically forwarded to main via `system:report-renderer-error`.
