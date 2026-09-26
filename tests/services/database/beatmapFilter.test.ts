import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL } from '../../../src/services/database/schema'
import {
  calculateMainBpmFromTimingPoints,
  getNoModStars
} from '../../../src/services/database/stableImporter'
import {
  runBeatmapFilter,
  getFilteredBeatmapsetIds
} from '../../../src/services/database/beatmapFilterQuery'

describe('Beatmap Filter and Normalization Logic', () => {
  describe('calculateMainBpmFromTimingPoints', () => {
    it('calculates BPM correctly from a single uninherited timing point', () => {
      // 300ms beat length = 60000 / 300 = 200 BPM
      const tps: [number, number, boolean][] = [[300, 0, true]]
      const bpm = calculateMainBpmFromTimingPoints(tps, 60000)
      expect(bpm).toBe(200)
    })

    it('determines the main BPM by maximum duration', () => {
      // Point 1: 400ms beat length (150 BPM) from 0 to 10000 (10s)
      // Point 2: 300ms beat length (200 BPM) from 10000 to 50000 (40s)
      const tps: [number, number, boolean][] = [
        [400, 0, true],
        [300, 10000, true]
      ]
      const bpm = calculateMainBpmFromTimingPoints(tps, 50000)
      expect(bpm).toBe(200)
    })

    it('ignores inherited timing points (negative beat lengths)', () => {
      const tps: [number, number, boolean][] = [
        [300, 0, true], // 200 BPM
        [-100, 5000, false] // Inherited 1.0x SV
      ]
      const bpm = calculateMainBpmFromTimingPoints(tps, 30000)
      expect(bpm).toBe(200)
    })

    it('returns 0 for empty or invalid timing points', () => {
      expect(calculateMainBpmFromTimingPoints([], 10000)).toBe(0)
      expect(calculateMainBpmFromTimingPoints(undefined, 10000)).toBe(0)
    })
  })

  describe('getNoModStars', () => {
    it('extracts NoMod (0) star rating for the given mode', () => {
      const bm = {
        star_rating_standard: { 0: 5.42, 16: 6.1 },
        star_rating_taiko: { 0: 3.2 }
      }
      expect(getNoModStars(bm, 0)).toBe(5.42)
      expect(getNoModStars(bm, 1)).toBe(3.2)
    })

    it('returns 0 if NoMod rating is absent', () => {
      const bm = {
        star_rating_standard: { 16: 6.1 }
      }
      expect(getNoModStars(bm, 0)).toBe(0)
    })
  })

  describe('runBeatmapFilter & getFilteredBeatmapsetIds with SQLite', () => {
    function createTestDb(): Database.Database {
      const db = new Database(':memory:')
      db.function('NORMALIZE_TEXT', (text: unknown) => {
        if (typeof text !== 'string') return ''
        return text
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
      })
      db.exec(CREATE_TABLES_SQL)
      db.exec(CREATE_INDEXES_SQL)
      return db
    }

    it('filters beatmaps by mode, stars, and Unicode accent-insensitive search', () => {
      const db = createTestDb()

      // Seed beatmapsets
      db.prepare(
        `
        INSERT INTO beatmapsets (
          id, artist, artist_unicode, title, title_unicode, creator, source, tags, status, bpm,
          source_origin, last_synced_at
        ) VALUES
          (101, 'Kana Hanazawa', '花澤香菜', 'Renai Circulation', '恋愛サーキュレーション', 'bakemonogatari', 'Anime', 'monogatari op', 'ranked', 120, 'stable', 1000),
          (102, 'Bich Phuong', 'Bích Phương', 'Di Du Dua Di', 'Đi Đu Đưa Đi', 'v-pop creator', 'Pop', 'vietnam dance', 'ranked', 128, 'stable', 1000)
      `
      ).run()

      // Seed beatmaps
      db.prepare(
        `
        INSERT INTO beatmaps (
          id, beatmapset_id, md5, mode, mode_name, status, version, difficulty_rating, total_length,
          hit_length, bpm, cs, ar, hp, od, source_origin, metrics_source, last_synced_at
        ) VALUES
          (1001, 101, 'md5_1', 0, 'osu', 'ranked', 'Hard', 3.5, 90, 85, 120, 3.5, 7.0, 5.0, 6.0, 'stable', 'stable', 1000),
          (1002, 101, 'md5_2', 0, 'osu', 'ranked', 'Insane', 5.8, 90, 85, 120, 4.0, 9.0, 6.0, 8.0, 'stable', 'stable', 1000),
          (1003, 102, 'md5_3', 0, 'osu', 'ranked', 'Expert', 6.2, 180, 175, 128, 4.2, 9.4, 7.0, 8.5, 'stable', 'stable', 1000)
      `
      ).run()

      // 1. Filter by stars range [5.0, 7.0]
      const starsFilter = {
        modes: ['osu'],
        status: 'hasLeaderboard',
        modeStats: {
          osu: {
            stars: [5.0, 7.0],
            bpm: [0, 400],
            cs: [0, 10],
            ar: [0, 10],
            hp: [0, 10],
            od: [0, 10]
          }
        },
        lengthRange: [0, 1800]
      }
      const starsRes = runBeatmapFilter(db, starsFilter)
      expect(starsRes.beatmapCount).toBe(2) // 5.8 and 6.2
      expect(starsRes.beatmapsetCount).toBe(2)

      // 2. Unicode accent search: typing 'bich phuong' finds 'Bích Phương'
      const searchFilter = {
        ...starsFilter,
        generalSearch: 'bich phuong'
      }
      const searchRes = runBeatmapFilter(db, searchFilter)
      expect(searchRes.beatmapCount).toBe(1)
      expect(searchRes.rows[0].beatmapId).toBe(1003)

      // 3. Test getFilteredBeatmapsetIds
      const ids = getFilteredBeatmapsetIds(db, starsFilter)
      expect(ids).toEqual([101, 102])

      // 4. Test Sorting
      // Sort stars ASC -> 5.8 (1002) then 6.2 (1003)
      const sortAscRes = runBeatmapFilter(db, {
        ...starsFilter,
        sortBy: 'stars',
        sortOrder: 'asc'
      })
      expect(sortAscRes.rows[0].beatmapId).toBe(1002)
      expect(sortAscRes.rows[1].beatmapId).toBe(1003)

      // Sort stars DESC -> 6.2 (1003) then 5.8 (1002)
      const sortDescRes = runBeatmapFilter(db, {
        ...starsFilter,
        sortBy: 'stars',
        sortOrder: 'desc'
      })
      expect(sortDescRes.rows[0].beatmapId).toBe(1003)
      expect(sortDescRes.rows[1].beatmapId).toBe(1002)

      // Sort title ASC -> 'Di Du Dua Di' (1003) then 'Renai Circulation' (1002)
      const sortTitleRes = runBeatmapFilter(db, {
        ...starsFilter,
        sortBy: 'title',
        sortOrder: 'asc'
      })
      expect(sortTitleRes.rows[0].beatmapId).toBe(1003)
      expect(sortTitleRes.rows[1].beatmapId).toBe(1002)

      // Sort relevance with keyword 'Renai' -> 1002 (matching title) should rank higher than 1003
      const sortRelevanceRes = runBeatmapFilter(db, {
        ...starsFilter,
        generalSearch: 'Renai',
        sortBy: 'relevance'
      })
      expect(sortRelevanceRes.rows[0].beatmapId).toBe(1002)

      // Multi-token AND search across Title and Version ('Renai Insane')
      const multiTokenRes = runBeatmapFilter(db, {
        ...starsFilter,
        generalSearch: 'Renai Insane'
      })
      expect(multiTokenRes.beatmapCount).toBe(1)
      expect(multiTokenRes.rows[0].beatmapId).toBe(1002)

      // Number catch-all ID search (Beatmap ID: 1003)
      const idSearchRes = runBeatmapFilter(db, {
        ...starsFilter,
        generalSearch: '1003'
      })
      expect(idSearchRes.beatmapCount).toBe(1)
      expect(idSearchRes.rows[0].beatmapId).toBe(1003)

      db.close()
    })
  })
})
