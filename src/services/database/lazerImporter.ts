import { realmService } from '../realmService'
import { DatabaseService } from './databaseService'
import type { NormalizedBeatmapRecord, NormalizedBeatmapsetRecord } from './types'

interface LazerImportSummary {
  processed: number
  accepted: number
  skippedInvalidBeatmapsetId: number
}

let lastLazerImportSummary: LazerImportSummary = {
  processed: 0,
  accepted: 0,
  skippedInvalidBeatmapsetId: 0
}

export function getLastLazerImportSummary(): LazerImportSummary {
  return { ...lastLazerImportSummary }
}

function modeFromInt(mode: number): 'osu' | 'taiko' | 'fruits' | 'mania' {
  switch (mode) {
    case 1:
      return 'taiko'
    case 2:
      return 'fruits'
    case 3:
      return 'mania'
    default:
      return 'osu'
  }
}

export async function importFromLazerRealm(
  onProgress?: (processed: number, total: number) => void
): Promise<{
  beatmapsets: number
  beatmaps: number
}> {
  const rows = await realmService.getBeatmapsForDatabase()
  if (rows.length === 0) {
    return { beatmapsets: 0, beatmaps: 0 }
  }

  const beatmapsetsById = new Map<number, NormalizedBeatmapsetRecord>()
  const beatmaps: NormalizedBeatmapRecord[] = []
  const summary: LazerImportSummary = {
    processed: 0,
    accepted: 0,
    skippedInvalidBeatmapsetId: 0
  }

  for (let i = 0; i < rows.length; i++) {
    summary.processed += 1
    const row = rows[i]
    if (!row.beatmapsetId || row.beatmapsetId <= 0) {
      summary.skippedInvalidBeatmapsetId += 1
      continue
    }

    if (!beatmapsetsById.has(row.beatmapsetId)) {
      beatmapsetsById.set(row.beatmapsetId, {
        id: row.beatmapsetId,
        artist: row.artist,
        artistUnicode: row.artistUnicode,
        title: row.title,
        titleUnicode: row.titleUnicode,
        creator: row.creator,
        source: row.source,
        tags: row.tags,
        status: row.status || 'unranked',
        bpm: row.bpm,
        rankedDate: row.rankedDate,
        submittedDate: row.submittedDate,
        lastUpdated: null,
        genreId: null,
        languageId: null,
        rating: null,
        spotlight: false,
        video: row.video,
        storyboard: row.storyboard,
        isScoreable: true,
        sourceOrigin: 'lazer'
      })
    }

    beatmaps.push({
      id: row.beatmapId,
      beatmapsetId: row.beatmapsetId,
      md5: row.md5,
      modeInt: row.modeInt,
      mode: modeFromInt(row.modeInt),
      status: row.status || 'unranked',
      version: row.version,
      difficultyRating: row.stars,
      totalLength: row.totalLength,
      hitLength: row.hitLength,
      bpm: row.bpm,
      cs: row.cs,
      ar: row.ar,
      hp: row.hp,
      od: row.od,
      maxCombo: null,
      playcount: null,
      passcount: null,
      sourceOrigin: 'lazer'
    })
    summary.accepted += 1

    if (onProgress && i % 5000 === 0) {
      onProgress(i, rows.length)
    }

    if (i > 0 && i % 2000 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }
  lastLazerImportSummary = summary

  const db = DatabaseService.getInstance()
  const syncedAt = Date.now()
  const sets = Array.from(beatmapsetsById.values())
  if (typeof db.upsertBatchAsync === 'function') {
    await db.upsertBatchAsync(sets, beatmaps, syncedAt)
  } else {
    db.upsertBatch(sets, beatmaps, syncedAt)
  }

  return { beatmapsets: beatmapsetsById.size, beatmaps: beatmaps.length }
}
