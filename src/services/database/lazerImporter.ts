import { realmService } from '../realmService'
import { DatabaseService } from './databaseService'
import type { NormalizedBeatmapRecord, NormalizedBeatmapsetRecord } from './types'

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

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.beatmapsetId || row.beatmapsetId <= 0) continue

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

    if (onProgress && i % 5000 === 0) {
      onProgress(i, rows.length)
    }
  }

  const db = DatabaseService.getInstance()
  const syncedAt = Date.now()
  db.upsertBatch(Array.from(beatmapsetsById.values()), beatmaps, syncedAt)

  return { beatmapsets: beatmapsetsById.size, beatmaps: beatmaps.length }
}
