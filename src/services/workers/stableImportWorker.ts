import { parentPort, workerData } from 'worker_threads'
import fs from 'fs'
import { OsuDBParser } from 'osu-db-parser'
import { parseRawStableBeatmaps, type StableDbData } from '../database/stableDbParserUtils'
import type { NormalizedBeatmapRecord, NormalizedBeatmapsetRecord } from '../database/types'
import type { StableImportSummary } from '../database/stableDbParserUtils'

export interface WorkerStartPayload {
  stableDbPath: string
}

export type WorkerMessageToParent =
  | { type: 'progress'; processed: number; total: number }
  | {
      type: 'done'
      sets: NormalizedBeatmapsetRecord[]
      beatmaps: NormalizedBeatmapRecord[]
      summary: StableImportSummary
    }
  | { type: 'error'; error: string }

function runWorker(): void {
  if (!parentPort) {
    return
  }

  const payload = workerData as WorkerStartPayload
  if (!payload || !payload.stableDbPath) {
    parentPort.postMessage({
      type: 'error',
      error: 'Missing stableDbPath in workerData'
    } satisfies WorkerMessageToParent)
    return
  }

  try {
    const buffer = fs.readFileSync(payload.stableDbPath)
    const parser = new OsuDBParser(buffer, null)
    const data = parser.getOsuDBData() as StableDbData | null
    const rawBeatmaps = data?.beatmaps ?? []

    const {
      sets,
      beatmaps: normalizedBeatmaps,
      summary
    } = parseRawStableBeatmaps(rawBeatmaps, (processed, total) => {
      parentPort?.postMessage({
        type: 'progress',
        processed,
        total
      } satisfies WorkerMessageToParent)
    })

    parentPort.postMessage({
      type: 'done',
      sets,
      beatmaps: normalizedBeatmaps,
      summary
    } satisfies WorkerMessageToParent)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    parentPort.postMessage({ type: 'error', error: message } satisfies WorkerMessageToParent)
  }
}

runWorker()
