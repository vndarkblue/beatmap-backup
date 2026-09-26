import fs from 'fs'
import path from 'path'
import { OsuDBParser } from 'osu-db-parser'
import { getOsuStablePath } from '../settingsStore'
import { DatabaseService } from './databaseService'
import type { NormalizedBeatmapRecord, NormalizedBeatmapsetRecord } from './types'

type StableBeatmap = {
  md5?: string
  beatmap_id?: number
  beatmapset_id?: number
  mode?: number
  ranked_status?: number
  difficulty?: string
  song_title?: string
  song_title_unicode?: string
  artist_name?: string
  artist_name_unicode?: string
  creator_name?: string
  song_source?: string
  song_tags?: string
  diff_approach?: number
  approach_rate?: number
  circle_size?: number
  hp_drain?: number
  overall_difficulty?: number
  total_time?: number
  drain_time?: number
  bpm?: number
  slider_velocity?: number
  play_count?: number
  pass_count?: number
  star_rating_standard?: Record<number | string, number>
  star_rating_taiko?: Record<number | string, number>
  star_rating_ctb?: Record<number | string, number>
  star_rating_mania?: Record<number | string, number>
  timing_points?: [number, number, boolean][]
}

export function getNoModStars(bm: StableBeatmap, modeInt: number): number {
  const modeMaps = [
    bm.star_rating_standard,
    bm.star_rating_taiko,
    bm.star_rating_ctb,
    bm.star_rating_mania
  ]
  const starsDict = modeMaps[modeInt] ?? modeMaps[0]
  if (starsDict && typeof starsDict === 'object') {
    const nomod = starsDict[0] ?? starsDict['0']
    if (typeof nomod === 'number' && !isNaN(nomod)) {
      return Math.round(nomod * 100) / 100
    }
  }
  return 0
}

export function calculateMainBpmFromTimingPoints(
  timingPoints: [number, number, boolean][] | undefined,
  totalTimeMs: number
): number {
  if (!timingPoints || timingPoints.length === 0) return 0
  const bpmTimes = new Map<number, number>()
  let currentBpm = 0
  let lastTime = totalTimeMs

  for (let i = timingPoints.length - 1; i >= 0; i--) {
    const [beatLength, offset, inheritsBpm] = timingPoints[i]
    if (inheritsBpm && beatLength > 0) {
      currentBpm = Math.round(60000 / beatLength)
    }
    if (currentBpm <= 0 || offset > lastTime) continue
    const segmentStart = i === 0 ? 0 : offset
    const duration = Math.max(0, lastTime - segmentStart)
    bpmTimes.set(currentBpm, (bpmTimes.get(currentBpm) ?? 0) + duration)
    lastTime = offset
  }

  if (bpmTimes.size === 0) return 0
  let maxDuration = -1
  let mainBpm = 0
  for (const [bpm, dur] of bpmTimes.entries()) {
    if (dur > maxDuration) {
      maxDuration = dur
      mainBpm = bpm
    }
  }
  return mainBpm
}

type StableDbData = {
  beatmaps?: StableBeatmap[]
}

interface StableImportSummary {
  processed: number
  accepted: number
  skippedMissingMd5: number
  skippedInvalidBeatmapsetId: number
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

function statusFromRankedStatus(status: number): string {
  switch (status) {
    case 4:
      return 'loved'
    case 3:
      return 'qualified'
    case 2:
      return 'approved'
    case 1:
      return 'ranked'
    case 0:
      return 'pending'
    case -1:
      return 'wip'
    case -2:
      return 'graveyard'
    default:
      return 'unranked'
  }
}

export function getStableDbPath(): string | null {
  const osuStablePath = getOsuStablePath()
  if (!osuStablePath) return null
  const dbPath = path.join(osuStablePath, 'osu!.db')
  return fs.existsSync(dbPath) ? dbPath : null
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

  const buffer = fs.readFileSync(stableDbPath)
  const parser = new OsuDBParser(buffer, null)
  const data = parser.getOsuDBData() as StableDbData | null
  const beatmaps = data?.beatmaps ?? []
  if (beatmaps.length === 0) {
    return { beatmapsets: 0, beatmaps: 0 }
  }

  const setMap = new Map<number, NormalizedBeatmapsetRecord>()
  const normalizedBeatmaps: NormalizedBeatmapRecord[] = []
  const summary: StableImportSummary = {
    processed: 0,
    accepted: 0,
    skippedMissingMd5: 0,
    skippedInvalidBeatmapsetId: 0
  }

  for (let i = 0; i < beatmaps.length; i++) {
    summary.processed += 1
    const bm = beatmaps[i]
    if (!bm.md5) {
      summary.skippedMissingMd5 += 1
      continue
    }
    if (!bm.beatmapset_id || bm.beatmapset_id <= 0) {
      summary.skippedInvalidBeatmapsetId += 1
      continue
    }

    const beatmapsetId = bm.beatmapset_id
    const modeInt = bm.mode ?? 0
    const mode = modeFromInt(modeInt)
    const status = statusFromRankedStatus(bm.ranked_status ?? 0)
    const bpm = calculateMainBpmFromTimingPoints(bm.timing_points, bm.total_time ?? 0)
    const stars = getNoModStars(bm, modeInt)

    if (!setMap.has(beatmapsetId)) {
      setMap.set(beatmapsetId, {
        id: beatmapsetId,
        artist: bm.artist_name ?? '',
        artistUnicode: bm.artist_name_unicode ?? '',
        title: bm.song_title ?? '',
        titleUnicode: bm.song_title_unicode ?? '',
        creator: bm.creator_name ?? '',
        source: bm.song_source ?? '',
        tags: bm.song_tags ?? '',
        status,
        bpm,
        rankedDate: null,
        submittedDate: null,
        lastUpdated: null,
        genreId: null,
        languageId: null,
        rating: null,
        spotlight: false,
        video: false,
        storyboard: false,
        isScoreable: true,
        sourceOrigin: 'stable'
      })
    }

    normalizedBeatmaps.push({
      id: bm.beatmap_id ?? null,
      beatmapsetId,
      md5: bm.md5,
      modeInt,
      mode,
      status,
      version: bm.difficulty ?? '',
      difficultyRating: stars,
      totalLength: Math.max(0, Math.floor((bm.total_time ?? 0) / 1000)),
      hitLength: bm.drain_time ?? 0,
      bpm,
      cs: bm.circle_size ?? 0,
      ar: bm.approach_rate ?? bm.diff_approach ?? 0,
      hp: bm.hp_drain ?? 0,
      od: bm.overall_difficulty ?? 0,
      maxCombo: null,
      playcount: bm.play_count ?? null,
      passcount: bm.pass_count ?? null,
      sourceOrigin: 'stable'
    })
    summary.accepted += 1

    if (onProgress && i % 5000 === 0) {
      onProgress(i, beatmaps.length)
    }

    if (i > 0 && i % 2000 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }
  lastStableImportSummary = summary

  const db = DatabaseService.getInstance()
  const syncedAt = Date.now()
  const sets = Array.from(setMap.values())
  if (typeof db.upsertBatchAsync === 'function') {
    await db.upsertBatchAsync(sets, normalizedBeatmaps, syncedAt)
  } else {
    db.upsertBatch(sets, normalizedBeatmaps, syncedAt)
  }

  return { beatmapsets: setMap.size, beatmaps: normalizedBeatmaps.length }
}
