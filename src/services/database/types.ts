export type SyncSource = 'stable' | 'lazer'

export type SourceOrigin = 'stable' | 'lazer' | 'both' | 'online'

export interface NormalizedBeatmapsetRecord {
  id: number
  artist: string
  artistUnicode: string
  title: string
  titleUnicode: string
  creator: string
  source: string
  tags: string
  status: string
  bpm: number
  rankedDate: string | null
  submittedDate: string | null
  lastUpdated: string | null
  genreId: number | null
  languageId: number | null
  rating: number | null
  spotlight: boolean
  video: boolean
  storyboard: boolean
  isScoreable: boolean
  sourceOrigin: SourceOrigin
}

export interface NormalizedBeatmapRecord {
  id: number | null
  beatmapsetId: number
  md5: string
  modeInt: number
  mode: 'osu' | 'taiko' | 'fruits' | 'mania'
  status: string
  version: string
  difficultyRating: number
  totalLength: number
  hitLength: number
  bpm: number
  cs: number
  ar: number
  hp: number
  od: number
  maxCombo: number | null
  playcount: number | null
  passcount: number | null
  sourceOrigin: SourceOrigin
}

export interface SyncProgressEvent {
  source: SyncSource
  phase: 'started' | 'progress' | 'completed' | 'skipped' | 'error'
  message?: string
  processed?: number
  total?: number
  durationMs?: number
  error?: string
}

export interface DatabaseStatus {
  schemaVersion: number
  totals: {
    beatmapsets: number
    beatmaps: number
  }
  stable: {
    configured: boolean
    fileExists: boolean
    lastSyncAt: number | null
    lastFileMtime: number | null
    currentFileMtime: number | null
    beatmapCount: number
    isDirty: boolean
  }
  lazer: {
    configured: boolean
    fileExists: boolean
    lastSyncAt: number | null
    lastFileMtime: number | null
    currentFileMtime: number | null
    beatmapCount: number
    isDirty: boolean
  }
}

export type CollectionResolveStatus = 'pending' | 'resolved' | 'notFound' | 'failed'

export interface CollectionMapCacheRecord {
  md5hash: string
  beatmapid: number | null
  beatmapsetid: number | null
  missing: boolean
  resolveStatus: CollectionResolveStatus
  sourceHint: string | null
  lastCheckedAt: number
}
