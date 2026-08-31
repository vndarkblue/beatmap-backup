import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseService } from '../../../src/services/database/databaseService'
import type {
  NormalizedBeatmapRecord,
  NormalizedBeatmapsetRecord,
  CollectionMapCacheRecord
} from '../../../src/services/database/types'
import { CURRENT_SCHEMA_VERSION } from '../../../src/services/database/schema'

describe('DatabaseService (Integration)', () => {
  let tempDir: string
  let dbPath: string
  let dbService: DatabaseService

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'db-service-test-'))
    dbPath = path.join(tempDir, 'test_beatmaps.db')
    dbService = DatabaseService.createForTest(dbPath)
  })

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('initializes schema and records the current schema version', () => {
    expect(dbService.getSchemaVersion()).toBe(CURRENT_SCHEMA_VERSION)
    expect(dbService.getMeta('schema_version')).toBe(String(CURRENT_SCHEMA_VERSION))
  })

  it('sets and gets metadata keys accurately', () => {
    expect(dbService.getMeta('non_existent_key')).toBeNull()

    dbService.setMeta('custom_key', 'custom_value')
    expect(dbService.getMeta('custom_key')).toBe('custom_value')

    dbService.setMeta('custom_key', 'updated_value')
    expect(dbService.getMeta('custom_key')).toBe('updated_value')
  })

  it('upserts beatmapsets and beatmaps, and returns accurate counts', () => {
    const sampleSet: NormalizedBeatmapsetRecord = {
      id: 100,
      artist: 'Artist 1',
      artistUnicode: 'Artist 1 JP',
      title: 'Title 1',
      titleUnicode: 'Title 1 JP',
      creator: 'Creator 1',
      source: 'Game',
      tags: 'tag1 tag2',
      status: 'ranked',
      bpm: 180,
      rankedDate: 1600000000,
      submittedDate: 1590000000,
      lastUpdated: 1600000000,
      genreId: 1,
      languageId: 2,
      rating: 9.5,
      spotlight: false,
      video: false,
      storyboard: false,
      isScoreable: true,
      sourceOrigin: 'stable'
    }

    const sampleBeatmap: NormalizedBeatmapRecord = {
      id: 1001,
      beatmapsetId: 100,
      md5: 'md5_hash_001',
      modeInt: 0,
      mode: 'osu',
      status: 'ranked',
      version: 'Hard',
      difficultyRating: 4.5,
      totalLength: 120,
      hitLength: 100,
      bpm: 180,
      cs: 4.0,
      ar: 9.0,
      hp: 6.0,
      od: 8.0,
      maxCombo: 500,
      playcount: 10,
      passcount: 8,
      sourceOrigin: 'stable'
    }

    dbService.upsertBatch([sampleSet], [sampleBeatmap], Date.now())

    const counts = dbService.getCounts()
    expect(counts.beatmapsets).toBe(1)
    expect(counts.beatmaps).toBe(1)

    expect(dbService.hasSyncedData('stable')).toBe(true)
    expect(dbService.hasSyncedData('lazer')).toBe(false)
    expect(dbService.getBeatmapCountBySource('stable')).toBe(1)
    expect(dbService.getBeatmapCountBySource('lazer')).toBe(0)
  })

  it('updates existing records on conflict and resolves sourceOrigin correctly', () => {
    const originalSet: NormalizedBeatmapsetRecord = {
      id: 200,
      artist: 'Artist 2',
      artistUnicode: 'Artist 2',
      title: 'Title 2',
      titleUnicode: 'Title 2',
      creator: 'Creator 2',
      source: '',
      tags: '',
      status: 'ranked',
      bpm: 150,
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
    }

    const originalMap: NormalizedBeatmapRecord = {
      id: 2001,
      beatmapsetId: 200,
      md5: 'md5_hash_002',
      modeInt: 0,
      mode: 'osu',
      status: 'ranked',
      version: 'Insane',
      difficultyRating: 5.2,
      totalLength: 150,
      hitLength: 130,
      bpm: 150,
      cs: 4.2,
      ar: 9.2,
      hp: 6.5,
      od: 8.5,
      maxCombo: 800,
      playcount: 50,
      passcount: 30,
      sourceOrigin: 'stable'
    }

    dbService.upsertBatch([originalSet], [originalMap], 1000)

    // Second upsert from lazer with the same beatmapset and map MD5
    const lazerSet: NormalizedBeatmapsetRecord = {
      ...originalSet,
      sourceOrigin: 'lazer'
    }
    const lazerMap: NormalizedBeatmapRecord = {
      ...originalMap,
      difficultyRating: 5.25, // lazer calculated star rating
      sourceOrigin: 'lazer'
    }

    dbService.upsertBatch([lazerSet], [lazerMap], 2000)

    expect(dbService.getBeatmapsetIdByMd5('md5_hash_002')).toBe(200)
    expect(dbService.getBeatmapCountBySource('stable')).toBe(1)
    expect(dbService.getBeatmapCountBySource('lazer')).toBe(1)
  })

  it('retrieves existing beatmapset IDs filtered by sources', () => {
    const set1: NormalizedBeatmapsetRecord = {
      id: 301,
      artist: 'A',
      artistUnicode: 'A',
      title: 'T',
      titleUnicode: 'T',
      creator: 'C',
      source: '',
      tags: '',
      status: 'ranked',
      bpm: 120,
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
    }

    const set2: NormalizedBeatmapsetRecord = {
      ...set1,
      id: 302,
      sourceOrigin: 'lazer'
    }

    dbService.upsertBatch([set1, set2], [], Date.now())

    const stableIds = dbService.getExistingBeatmapsetIds({ stable: true })
    expect(stableIds.has(301)).toBe(true)
    expect(stableIds.has(302)).toBe(false)

    const lazerIds = dbService.getExistingBeatmapsetIds({ lazer: true })
    expect(lazerIds.has(301)).toBe(false)
    expect(lazerIds.has(302)).toBe(true)

    const bothIds = dbService.getExistingBeatmapsetIds({ stable: true, lazer: true })
    expect(bothIds.has(301)).toBe(true)
    expect(bothIds.has(302)).toBe(true)
  })

  it('manages collection map cache records and calculates collection sync stats', () => {
    const record1: CollectionMapCacheRecord = {
      md5hash: 'md5_col_1',
      beatmapid: 4001,
      beatmapsetid: 400,
      missing: false,
      resolveStatus: 'resolved',
      sourceHint: 'api',
      lastCheckedAt: 1000
    }

    const record2: CollectionMapCacheRecord = {
      md5hash: 'md5_col_2',
      beatmapid: null,
      beatmapsetid: null,
      missing: true,
      resolveStatus: 'pending',
      sourceHint: null,
      lastCheckedAt: 500
    }

    const record3: CollectionMapCacheRecord = {
      md5hash: 'md5_col_3',
      beatmapid: null,
      beatmapsetid: null,
      missing: false,
      resolveStatus: 'notFound',
      sourceHint: 'mirror',
      lastCheckedAt: 800
    }

    dbService.upsertCollectionMapCache(record1)
    dbService.upsertCollectionMapCacheBatch([record2, record3])

    const fetched1 = dbService.getCollectionMapCacheByMd5('md5_col_1')
    expect(fetched1).toEqual(record1)

    expect(dbService.getPendingCollectionMapCacheCount()).toBe(1)

    const pending = dbService.getCollectionMapCachePendingForSync({
      limit: 10,
      retryBeforeMs: 1000
    })
    expect(pending).toHaveLength(1)
    expect(pending[0].md5hash).toBe('md5_col_2')

    const stats = dbService.getCollectionSyncStats()
    expect(stats.resolved).toBe(1)
    expect(stats.pending).toBe(1)
    expect(stats.notFound).toBe(1)
    expect(stats.failed).toBe(0)
    expect(stats.missingLocal).toBe(1)
  })

  it('asynchronously upserts batch in chunks', async () => {
    const sets: NormalizedBeatmapsetRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: 500 + i,
      artist: `Artist ${i}`,
      artistUnicode: `Artist ${i}`,
      title: `Title ${i}`,
      titleUnicode: `Title ${i}`,
      creator: 'C',
      source: '',
      tags: '',
      status: 'ranked',
      bpm: 120,
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
    }))

    const bms: NormalizedBeatmapRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: 5000 + i,
      beatmapsetId: 500 + i,
      md5: `md5_batch_${i}`,
      modeInt: 0,
      mode: 'osu',
      status: 'ranked',
      version: 'Normal',
      difficultyRating: 2.0,
      totalLength: 100,
      hitLength: 90,
      bpm: 120,
      cs: 3,
      ar: 6,
      hp: 5,
      od: 5,
      maxCombo: 200,
      playcount: 1,
      passcount: 1,
      sourceOrigin: 'stable'
    }))

    await dbService.upsertBatchAsync(sets, bms, Date.now(), 2)

    const counts = dbService.getCounts()
    expect(counts.beatmapsets).toBe(5)
    expect(counts.beatmaps).toBe(5)
  })

  it('refreshes source tags for stable and lazer', () => {
    const set: NormalizedBeatmapsetRecord = {
      id: 600,
      artist: 'A',
      artistUnicode: 'A',
      title: 'T',
      titleUnicode: 'T',
      creator: 'C',
      source: '',
      tags: '',
      status: 'ranked',
      bpm: 120,
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
      sourceOrigin: 'both'
    }

    const bm: NormalizedBeatmapRecord = {
      id: 6001,
      beatmapsetId: 600,
      md5: 'md5_both_tag',
      modeInt: 0,
      mode: 'osu',
      status: 'ranked',
      version: 'Normal',
      difficultyRating: 2.0,
      totalLength: 100,
      hitLength: 90,
      bpm: 120,
      cs: 3,
      ar: 6,
      hp: 5,
      od: 5,
      maxCombo: 200,
      playcount: 1,
      passcount: 1,
      sourceOrigin: 'both'
    }

    dbService.upsertBatch([set], [bm], Date.now())

    // When refreshing 'stable', opposite source is 'lazer', 'both' -> 'lazer'
    dbService.refreshSourceTag('stable')
    expect(dbService.getBeatmapCountBySource('stable')).toBe(0)
    expect(dbService.getBeatmapCountBySource('lazer')).toBe(1)
  })
})
