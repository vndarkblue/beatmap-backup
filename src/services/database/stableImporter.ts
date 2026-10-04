import fs from 'fs'
import path from 'path'
import { Worker } from 'worker_threads'
import { OsuDBParser } from 'osu-db-parser'
import { getOsuStablePath } from '../settingsStore'
import { DatabaseService } from './databaseService'
import type { NormalizedBeatmapRecord, NormalizedBeatmapsetRecord } from './types'
import {
  type StableBeatmap,
  type StableDbData,
  type StableImportSummary,
  getNoModStars,
  calculateMainBpmFromTimingPoints,
  modeFromInt,
  statusFromRankedStatus,
  parseRawStableBeatmaps
} from './stableDbParserUtils'
import type { WorkerMessageToParent, WorkerStartPayload } from '../workers/stableImportWorker'

export type { StableBeatmap, StableDbData, StableImportSummary }
export {
  getNoModStars,
  calculateMainBpmFromTimingPoints,
  modeFromInt,
  statusFromRankedStatus,
  parseRawStableBeatmaps
}

let lastStableImportSummary: StableImportSummary = {
  processed: 0,
  accepted: 0,
  skippedMissingMd5: 0,
  skippedInvalidBeatmapsetId: 0
}

export function getLastStableImportSummary(): StableImportSummary {
  return { ...lastStableImportSummary }
}

export function getStableDbPath(): string | null {
  const osuStablePath = getOsuStablePath()
  if (!osuStablePath) return null
  const dbPath = path.join(osuStablePath, 'osu!.db')
  return fs.existsSync(dbPath) ? dbPath : null
}

function resolveWorkerScriptPath(): string | null {
  const candidates = [
    path.join(__dirname, 'stableImportWorker.js'),
    path.join(__dirname, '../workers/stableImportWorker.js'),
    path.join(process.cwd(), 'out/main/stableImportWorker.js')
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

function parseInWorkerThread(
  workerPath: string,
  stableDbPath: string,
  onProgress?: (processed: number, total: number) => void
): Promise<{
  sets: NormalizedBeatmapsetRecord[]
  beatmaps: NormalizedBeatmapRecord[]
  summary: StableImportSummary
}> {
  return new Promise((resolve, reject) => {
    const payload: WorkerStartPayload = { stableDbPath }
    const worker = new Worker(workerPath, { workerData: payload })

    worker.on('message', (msg: WorkerMessageToParent) => {
      if (msg.type === 'progress') {
        onProgress?.(msg.processed, msg.total)
      } else if (msg.type === 'done') {
        worker.terminate().catch(() => {})
        resolve({
          sets: msg.sets,
          beatmaps: msg.beatmaps,
          summary: msg.summary
        })
      } else if (msg.type === 'error') {
        worker.terminate().catch(() => {})
        reject(new Error(msg.error))
      }
    })

    worker.on('error', (err) => {
      worker.terminate().catch(() => {})
      reject(err)
    })

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`))
      }
    })
  })
}

function parseInProcess(
  stableDbPath: string,
  onProgress?: (processed: number, total: number) => void
): {
  sets: NormalizedBeatmapsetRecord[]
  beatmaps: NormalizedBeatmapRecord[]
  summary: StableImportSummary
} {
  const buffer = fs.readFileSync(stableDbPath)
  const parser = new OsuDBParser(buffer, null)
  const data = parser.getOsuDBData() as StableDbData | null
  const beatmaps = data?.beatmaps ?? []
  return parseRawStableBeatmaps(beatmaps, onProgress)
}

export async function importFromStableDb(
  onProgress?: (processed: number, total: number) => void
): Promise<{
  beatmapsets: number
  beatmaps: number
}> {
  const stableDbPath = getStableDbPath()
  if (!stableDbPath) {
    throw new Error('osu!.db not found. Please verify osu!stable path in settings.')
  }

  let parsed: {
    sets: NormalizedBeatmapsetRecord[]
    beatmaps: NormalizedBeatmapRecord[]
    summary: StableImportSummary
  }

  const isTestEnv = Boolean(process.env.VITEST || process.env.NODE_ENV === 'test')
  const workerPath = !isTestEnv ? resolveWorkerScriptPath() : null

  if (workerPath) {
    try {
      parsed = await parseInWorkerThread(workerPath, stableDbPath, onProgress)
    } catch (workerErr) {
      console.warn('Stable import worker failed, falling back to in-process parsing:', workerErr)
      parsed = parseInProcess(stableDbPath, onProgress)
    }
  } else {
    parsed = parseInProcess(stableDbPath, onProgress)
  }

  lastStableImportSummary = parsed.summary

  const db = DatabaseService.getInstance()
  const syncedAt = Date.now()
  if (typeof db.upsertBatchAsync === 'function') {
    await db.upsertBatchAsync(parsed.sets, parsed.beatmaps, syncedAt)
  } else {
    db.upsertBatch(parsed.sets, parsed.beatmaps, syncedAt)
  }

  return { beatmapsets: parsed.sets.length, beatmaps: parsed.beatmaps.length }
}
