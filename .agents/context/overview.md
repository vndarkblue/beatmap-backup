# Overview: osu! Beatmap Backup

**osu! Beatmap Backup** is a modern, secure, and highly optimized desktop application designed to solve the backup,
filtering, management, and restoration needs of osu! players across both **osu!stable** and **osu!lazer**.

---

## 1. Core Problem & Solution

osu! players frequently amass beatmap libraries spanning dozens to hundreds of gigabytes (tens of thousands of beatmapsets).
When reinstalling systems, migrating between stable and lazer, or sharing favorite beatmap collections, copying entire song
directories consumes excessive time and disk space.

**osu! Beatmap Backup addresses this challenge through two primary mechanisms:**

1. **Ultra-lightweight Metadata Backup (`.bbak`)**:
   - Rather than compressing hundreds of gigabytes of audio and video media, the application extracts unique
     `beatmapsetId` records and metadata from the game database into a compact `.bbak` file (typically only a few megabytes).
   - This `.bbak` file can be transferred to any computer to re-download all beatmapsets from public mirror services at high speeds.
2. **High-Performance Downloader**:
   - Reads `.bbak` files and distributes parallel downloads across 5 major mirrors (osu.direct, NeriNyan, catboy.best, Nekoha, BeatConnect).
   - Features automated rate limiting, mirror failover on HTTP 429 or errors, `.osz` ZIP integrity checks, and persistent
     queue snapshots to resume interrupted sessions.
3. **Deep Filtering & Search**:
   - Integrated accent-insensitive Unicode search, filtering by Game Mode (osu!standard, Taiko, Catch, Mania), Star Rating,
     BPM, Ranked/Loved status, or specific Collections to export custom specialized backups.
4. **Dual Support for Stable & Lazer**:
   - Parses `osu!.db` and `collection.db` from osu!stable off the main thread via a dedicated worker thread.
   - Inspects `client.realm` from osu!lazer in read-only mode using dynamic schema inspection.
   - Consolidates both datasets into a high-performance local SQLite database.

---

## 2. Codebase Design Philosophy

1. **Zero Data Corruption**:
   - Never access game database files while the game process is running.
   - All critical user data operations employ atomic disk writes (`atomicWriteFile`).
2. **Respectful Rate Limiting**:
   - Public beatmap mirrors are maintained by volunteer non-profit community members. The codebase enforces strict,
     hard-coded rate limit caps to safeguard user IP addresses and protect mirror infrastructure.
3. **Strict Process Isolation**:
   - The Renderer operates as a pure Chromium frontend without Node.js privileges or direct filesystem access.
     All IPC interactions occur across a strictly typed ContextBridge (`window.electronAPI`).
4. **Lean Resource Footprint**:
   - Main process caps V8 heap usage (`--max-old-space-size=256`).
   - Unnecessary background networking in Chromium is disabled.
   - CPU-heavy binary parsing runs in background `worker_threads`, preventing UI thread stutter.
5. **Full Internationalization (i18n)**:
   - Comprehensive support for English, Vietnamese, and Japanese with 100% dictionary synchronization.

---

## 3. Tech Stack Summary

- **Runtime & Desktop Shell**: Electron 35.1.5 (Node 22, ABI 133).
- **Bundler & Build Tool**: `electron-vite` 3.1.0, Vite 6.2.6, Rollup.
- **Frontend Framework**: Vue 3.5.13 (Composition API, `<script setup lang="ts">`).
- **UI & Styling**: Vuetify 3.8.7 (Material Design 3), `@mdi/js` SVG icons, Scoped CSS + Custom CSS Variables.
- **State Management**: Pure Vue Composables (`useBackupWorkflow`, `useDownloadQueue`, etc.).
- **Database**: `better-sqlite3` 12.9.0 (WAL mode, custom collation), `realm` 12.6.0 (Read-only dynamic inspection).
- **Binary Parsing**: `osu-db-parser` 2.0.1.
- **Networking & Streams**: Native HTTP/HTTPS streams, `p-queue` 8.1.0.
- **Packaging**: `electron-builder` 25.1.8 (NSIS, Portable, AppImage, Snap, Deb, DMG).
- **Testing & Quality**: Vitest 4.0.1, V8 coverage, ESLint 9 (Flat config), Prettier 3, Dual Typecheck (`tsc` + `vue-tsc`).
