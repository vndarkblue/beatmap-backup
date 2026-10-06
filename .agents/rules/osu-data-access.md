---
trigger: glob
globs: src/services/database/**/*.ts,src/services/collection/**/*.ts,src/services/processDetector.ts,src/services/realmService.ts
---

# osu! Data Access & Database Integrity Rules

The application directly interfaces with binary game data across two distinct osu! architectures: **osu!stable** (proprietary `.db` binary format) and **osu!lazer** (`client.realm` NoSQL database), consolidating both into a local SQLite database (`beatmaps.db`).

## 1. Process Locking Guard

> [!CAUTION]
> **MANDATORY PROCESS CHECK PRIOR TO ACCESSING GAME DATA!**

1. Prior to parsing `osu!.db`, `collection.db`, or opening `client.realm`, you must call:
   ```ts
   const proc = await isOsuProcessRunning(source) // 'stable' | 'lazer' | 'any'
   if (proc.running) {
     // Abort, skip, or prompt the user to close the game
   }
   ```
2. **Rationale**:
   - Running games maintain exclusive file locks on `osu!.db` and `client.realm`.
   - Concurrent read/write access can cause data corruption, I/O deadlocks, or crash the user's game.
3. Never attempt to circumvent this safeguard using force-read flags while the game process is active.

## 2. osu!stable Data Access

1. **`osu!.db` (Beatmap Catalog)**:
   - Proprietary osu! binary stream parsed using `osu-db-parser`.
   - Since `osu!.db` may contain tens of thousands of beatmaps and consume hundreds of MBs of memory during binary parsing, this operation **must execute inside a worker thread** (`src/services/workers/stableImportWorker.ts`) to avoid freezing the Main process Event Loop.
2. **`collection.db` (User Collections)**:
   - Parsed via `stableCollectionParser.ts`.
   - Stores individual MD5 hashes for each difficulty in a collection.
3. **`Songs` Folder**:
   - Directory containing uncompressed beatmap sets. When generating backups or exporting locally, always traverse files using `safeJoinWithinRoot`.

## 3. osu!lazer Data Access

1. **`client.realm`**:
   - osu!lazer's Realm binary database.
   - Handled through `realmService.ts` (`realm 12.6.0`).
   - Must be opened strictly in **read-only** mode (`readOnly: true`), utilizing dynamic schema inspection to stay resilient across upstream schema updates.
   - Never execute write operations against `client.realm`.
2. **Sharded File Storage**:
   - Lazer does not organize files by song folder names; all constituent files are SHA-256 hashed and sharded into paths like `files/ab/abcdef...`.
   - `localBeatmapExport.ts` reassembles these files based on Realm metadata into standard `.osz` archives.

## 4. Local Application Database (`beatmaps.db`)

1. **SQLite Configuration (`better-sqlite3`)**:
   - Located at `userData/beatmaps.db`.
   - Always enforce WAL mode (`PRAGMA journal_mode = WAL`) and foreign keys (`PRAGMA foreign_keys = ON`).
   - Register custom scalar function `NORMALIZE_TEXT` for accent-insensitive search and Unicode normalization.
2. **Upsert Priority**:
   - When synchronizing songs from both Stable and Lazer, respect precedence rules defined in `upsertPriority.ts` to prevent stale data from overwriting newer entries.
3. **Connection Management**:
   - Only `DatabaseService.getInstance()` is permitted to maintain the SQLite database handle. Never create concurrent SQLite connections.

## 5. Native Addon ABI Notes

1. `better-sqlite3` and `realm` are C++ native addons compiled against Electron 35 ABI (`NODE_MODULE_VERSION 133`).
2. Never tamper with the `postinstall` script in `package.json` (`electron-builder install-app-deps`).
3. When running tests under host Node.js (different ABI), mock native layers or test compatible modules (see `rules/workflow-tests.md`).
