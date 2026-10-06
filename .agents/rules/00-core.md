---
trigger: always_on
---

# Core Rules — osu! Beatmap Backup

Electron 35 desktop app (Vue 3 + Vuetify renderer, Node main process, SQLite/Realm) to backup,
filter, and re-download osu! beatmaps. This file is always loaded: it contains only **inviolable red lines**,
the **documentation map**, and the **Definition of Done**. Detailed rules/contexts live in other files
(auto-loaded via glob or when needed).

## 1. Inviolable Red Lines (Violations = Crash, Data Loss, Vulnerabilities, or User IP Ban)

1. `src/main/index.ts`: Line 1 **must** be `import './initPortable'`. Never reorder imports;
   do not let auto-organize-imports touch this file.
2. Renderer (`src/renderer/**`) **must never** import `fs`, `path`, `child_process`, `electron`,
   `better-sqlite3`, `realm`, `electron-store`, or any runtime module from `src/services/**` /
   `src/main/**` (except `import type`). All I/O must go through `window.electronAPI`.
3. Every `shell.openPath` / `shell.showItemInFolder` / `shell.openExternal` call and any path joined from input
   must pass through `src/main/pathGuards.ts`.
4. Never read `osu!.db`, `collection.db`, or `client.realm` without first checking
   `isOsuProcessRunning(...)` → `.running === false`.
5. Never loosen mirror rate limits (`MINO_*`, `BEATCONNECT_*`, `DEFAULT_MIRROR_MAX_CONCURRENCY`
   constants in `src/services/downloadService.ts`).
6. Write user data files (`.bbak`, queue snapshots, exports) using `atomicWriteFile()`.
7. Never delete the `postinstall` script, never remove `external` native modules in
   `electron.vite.config.ts`, and never lower coverage thresholds in `vitest.config.ts` to make tests pass.
8. Do not add Pinia/Vuex, TailwindCSS, axios, or other UI libraries. Do not add new dependencies
   without asking the user first.
9. When performing a Git commit (`git commit`): **Mandatory** to present the proposed commit message
   for user approval and only commit after the user agrees. Never commit silently.

## 2. Documentation Map (`.agents/`)

| When                                        | Read                                 |
| :------------------------------------------ | :----------------------------------- |
| Starting unfamiliar task / need big picture | `.agents/context/overview.md`        |
| Finding which file does what                | `.agents/context/directory-map.md`   |
| Tracing data flow, IPC channel, or event    | `.agents/context/data-flow.md`       |
| Encountering osu! terms (beatmapset, .osz…) | `.agents/context/domain-glossary.md` |
| Before "fixing" what looks like an old bug  | `.agents/context/known-gaps.md`      |
| Running tests / verify / build / native ABI | `.agents/rules/workflow-tests.md`    |
| Adding an end-to-end IPC endpoint           | skill `add-ipc-endpoint`             |
| Adding / modifying UI strings               | skill `add-i18n-text`                |

Code-area rules (auto-loaded via glob): `architecture`, `coding-style`, `main-ipc-preload`,
`services`, `renderer-vue`, `security-paths`, `downloads-mirrors`, `osu-data-access`, `i18n`.

## 3. Definition of Done (Mandatory before reporting completion)

1. `npm run lint` → 0 errors (no new warnings introduced).
2. `npm run typecheck` → passes both `tsc` (node) and `vue-tsc` (web).
3. Relevant tests pass; if modifying logic within coverage thresholds → `npm run test:coverage`.
4. If changing UI strings → `en.json`, `vi.json`, `ja.json` must share exact keys and identical placeholders.
5. Clearly report: what commands were executed, the results, and which tests were skipped/failed due to native ABI (if any).
6. If a Git commit step is involved: Must present the proposed commit message for user review before committing.

Full verification pipeline: `npm run check` (= lint + typecheck + test:coverage). The user's default shell
is **PowerShell on Windows**.
