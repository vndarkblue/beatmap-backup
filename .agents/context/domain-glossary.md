# Domain Glossary: osu! Concepts & Terminology

Detailed breakdown of domain-specific terminology within the **osu!** ecosystem and how concepts are modeled
within the **Beatmap Backup** codebase.

---

## 1. Beatmap vs. Beatmapset (The Core Distinction)

| Concept                       | File Format      | Identifiers             | Technical Definition                                                                                                                                  |
| :---------------------------- | :--------------- | :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beatmap (Difficulty)**      | `.osu` file      | `beatmapId`, `MD5 hash` | A specific difficulty level of a song (e.g., Easy, Hard, Insane). Defines hit object coordinates, timing points, and difficulty settings (CS, AR, OD, HP). |
| **BeatmapSet (Song Package)** | `.osz` file (ZIP)| `beatmapsetId`          | The complete song package containing all constituent difficulties (all `.osu` files), audio tracks (`audio.mp3`), background art (`bg.jpg`), video, and storyboards. |

> [!IMPORTANT]
> The Backup (`.bbak`), Download, and Restore pipelines in this application operate at the **BeatmapSet** level
> (`beatmapsetId`). When downloading, the application retrieves complete `.osz` archives containing all difficulty variations.

---

## 2. File Formats & Storage

### `.bbak` (Beatmap Backup File)

- **Structure**: Lightweight plain text (UTF-8) format produced by the application.
- **Example Layout**:
  ```text
  # osu! beatmap backup file
  # Exported: 2026-10-04T01:00:00.000Z
  # Total Beatmapsets: 3
  # Filter: Mode=osu, MinStars=5.0
  123456
  789012
  345678
  ```
- **Advantages**: A library of 50,000 beatmapsets requires less than 500 KB, making it ideal for cloud storage, git, or instant sharing.

### `.osz` File

- **Structure**: Standard ZIP archive (`PK\x03\x04`) using the `.osz` file extension.
- When double-clicked by the user, the osu! game client automatically decompresses and ingests the archive into its library.

### No-Video Download (`?noVideo`)

- Download query parameter instructing mirrors to omit large video assets (`.mp4`, `.flv`, `.avi`).
- Yields 50% to 80% bandwidth reduction and preserves disk storage for users who do not require background videos.

---

## 3. Collections & The MD5 Hash Lookup Challenge

- **In osu!**: Players group songs into custom categories called Collections (e.g., "Warmup", "Stream 200BPM", "Favorites").
- **Data Model Discrepancy**:
  - osu!stable's `collection.db` indexes songs using the **MD5 hash** of individual `.osu` difficulty files, **not by `beatmapsetId`**.
  - Public mirror endpoints accept downloads strictly by `beatmapsetId`.
- **Beatmap Backup Solution**:
  - The application maintains a bi-directional index mapping `MD5 Hash ↔ beatmapsetId` in its local SQLite database (`beatmaps.db`).
  - For unindexed beatmaps, `osuDirectService.ts` performs reverse lookups against the osu!direct API to resolve corresponding `beatmapsetId` values.

---

## 4. osu!stable vs. osu!lazer (Architectural Differences)

### osu!stable (Legacy Client)

- **Database Files**: `osu!.db` (beatmap metadata catalog) and `collection.db` (user collections). Both use proprietary binary serialization.
- **Song Storage**: Located in `Songs/` organized as `{beatmapsetId} {Artist} - {Title}` directories.
- **Process Name**: `osu!.exe`.

### osu!lazer (Modern Client)

- **Database File**: `client.realm` (MongoDB Realm NoSQL database).
- **Sharded File Storage**: Does not use named song folders. Constituent assets (audio, images, `.osu`) are SHA-256 hashed and sharded into `files/ab/abcdef123456...`.
- **Process Name**: `osu.exe` (or `osu!` on macOS/Linux).

---

## 5. Portable Execution Mode

- The application supports an isolated portable build for Windows.
- In portable mode, configuration files, the local SQLite database (`beatmaps.db`), and logs (`logs/`) are stored
  in a `data/` subdirectory adjacent to the executable rather than inside `%APPDATA%`.
- Enables running from USB flash drives or external drives without leaving system traces on host computers.
