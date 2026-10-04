# AI Agent Guide & Rules Map — osu! Beatmap Backup

All coding standards, technical architecture guidelines, and operational runbooks for AI agents are modularly organized within the [`.agents/`](file:///d:/coding/osu-beatmap-backup/.agents) directory:

## 1. Coding Rules — Loaded by File Scope

- [00-core.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/00-core.md): **(Always loaded)** Inviolable red lines, documentation map, and Definition of Done.
- [architecture.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/architecture.md): Module layering matrix, Main process initialization contract, state management.
- [coding-style.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/coding-style.md): Prettier, strict TypeScript, naming conventions, Vue SFC standards, and icon usage.
- [main-ipc-preload.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/main-ipc-preload.md): IPC 4-point contract, teardown registration, and ContextBridge protection.
- [services.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/services.md): Singleton pattern, rotating logs, worker threads, safe disk writes.
- [renderer-vue.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/renderer-vue.md): Vue 3 conventions, state management via Composables, memory leak prevention, and UI performance.
- [security-paths.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/security-paths.md): Shell guards, path traversal defense, sensitive token encryption.
- [downloads-mirrors.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/downloads-mirrors.md): Mandatory rate limits across 5 mirrors, `.osz` ZIP integrity checks.
- [osu-data-access.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/osu-data-access.md): Process check before read/write, parsing `osu!.db`, Lazer Realm, and SQLite.
- [i18n.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/i18n.md): Triangle parity rule (`en`, `vi`, `ja`), 100% placeholder synchronization.
- [workflow-tests.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/workflow-tests.md): Testing workflows, hard coverage thresholds, handling ABI mismatches.

## 2. In-Depth Context — Read as Needed

- [overview.md](file:///d:/coding/osu-beatmap-backup/.agents/context/overview.md): High-level overview, problems solved, and core design philosophy.
- [directory-map.md](file:///d:/coding/osu-beatmap-backup/.agents/context/directory-map.md): Detailed structural map and responsibilities of each file/folder.
- [data-flow.md](file:///d:/coding/osu-beatmap-backup/.agents/context/data-flow.md): Data flows for key workflows (Backup, Download, Sync, Filter) and IPC reference table.
- [domain-glossary.md](file:///d:/coding/osu-beatmap-backup/.agents/context/domain-glossary.md): osu! domain terms (Beatmap vs Beatmapset, .osz, MD5 hash, Collection, Stable vs Lazer).
- [known-gaps.md](file:///d:/coding/osu-beatmap-backup/.agents/context/known-gaps.md): Discrepancies with legacy documentation, dead code traces, and pitfalls.

## 3. Operational Skills — Runbooks

- [`add-ipc-endpoint`](file:///d:/coding/osu-beatmap-backup/.agents/skills/add-ipc-endpoint/SKILL.md): 6-step runbook for adding an end-to-end type-safe IPC channel.
- [`add-i18n-text`](file:///d:/coding/osu-beatmap-backup/.agents/skills/add-i18n-text/SKILL.md): 4-step runbook for adding or updating translations across all 3 locales.
