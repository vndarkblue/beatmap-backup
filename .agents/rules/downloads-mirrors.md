---
trigger: glob
globs: src/services/download/**/*.ts,src/services/downloadService.ts,src/config/beatmapMirrors.ts
---

# Downloads & Beatmap Mirrors Rules

The beatmap download engine employs a multi-threaded HTTP streaming architecture featuring intelligent mirror failover, `.osz` ZIP integrity verification, and queue snapshot persistence.

## 1. Mandatory Rate Limiting

Under no circumstances should rate limit constants be increased or removed. Violations will result in the user's IP address being permanently banned by mirror providers:

| Mirror                   | Condition                    | Max Concurrency                          | Min Dispatch Interval          | Rate Limit / Minute     |
| :----------------------- | :--------------------------- | :--------------------------------------- | :----------------------------- | :---------------------- |
| **Mino (`catboy.best`)** | General                      | **2**                                    | **600ms**                      | Max 60 requests/minute  |
| **BeatConnect**          | With API Token               | **5**                                    | **150ms**                      | Governed by token quota |
| **BeatConnect**          | Without Token                | **2**                                    | **800ms**                      | -                       |
| **Other mirrors**        | osu.direct, NeriNyan, Nekoha | **3** (`DEFAULT_MIRROR_MAX_CONCURRENCY`) | Dynamic                        | -                       |

> [!CAUTION]
> Even if the user sets `downloadThreadCount = 10` in settings, total download concurrency for any individual mirror must **never** exceed `getMirrorMaxConcurrencyCap(mirrorName)`.

## 2. Error Handling & Automated Cooldown Mechanism

1. **HTTP 429 (Rate Limited)**:
   - Trigger a cooldown for the affected mirror (`BASE_RATE_LIMIT_COOLDOWN_MS = 5000` with exponential backoff, capped at `60000ms`).
   - Automatically failover the task to the next fallback mirror in priority order.
2. **HTTP 401 (Unauthorized on BeatConnect)**:
   - Classify error as `auth-invalid`.
   - Immediately clear runtime token (`setBeatconnectRuntimeToken('')`), reduce concurrency cap to `BEATCONNECT_UNAUTH_MAX_CONCURRENCY` (2 threads) and dispatch interval to 800ms.
   - Reset task status to `waiting` to retry under guest access.
3. **HTTP 404 (Not Found)**:
   - Classify as `not-found`. If all configured mirrors return 404, mark the beatmapset with a permanent `error`.

## 3. Stream Downloads & `.osz` Integrity Verification

1. **Safe Disk Writing via Streams**:
   - Use `httpDownloader.ts` to pipe the stream directly into a temporary file (`.osz.download`).
   - Do not buffer multi-megabyte beatmap packages entirely into memory RAM buffers.
2. **Metadata & ZIP Structure Checks**:
   - Following stream completion, mandatory integrity validation must be performed (`oszMetadata.ts`).
   - Check ZIP magic header (`PK\x03\x04`), inspect `.osu` directory structure.
   - If the file has invalid compression or the mirror returned an HTML error page (fake download), immediately delete the temporary file and classify task as `transient` to retry on another mirror.
   - Only rename from `.download` to `.osz` after passing all integrity checks.

## 4. Queue Persistence & Recovery

1. **Checkpointing**:
   - The download process periodically persists snapshots to `userData/download-queue.json` via `queuePersistence.ts`.
   - All checkpoint writes must utilize `atomicWriteFile`.
2. **Startup & Recovery**:
   - On application startup, if an incomplete checkpoint from a prior session is detected, present `DownloadRecoveryDialog.vue`.
   - The user can select:
     - `resume`: Continue downloading remaining beatmaps.
     - `discard`: Cleanly wipe the checkpoint file (`discardRecoveryState()`).
3. **Export Failed Beatmaps**:
   - Provide functionality to export failed downloads (`download:export-failed-backup`) into a new `.bbak` file so users can retry at a later time.
