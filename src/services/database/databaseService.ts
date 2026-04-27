import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL, CURRENT_SCHEMA_VERSION } from './schema'
import type {
  CollectionMapCacheRecord,
  CollectionResolveStatus,
  NormalizedBeatmapRecord,
  NormalizedBeatmapsetRecord,
  SyncSource
} from './types'
import { runBeatmapFilter, type BeatmapFilterResult } from './beatmapFilterQuery'

type MetaRow = { value: string }
type BeatmapSetIdRow = { beatmapset_id: number }
type CollectionMapCacheRow = {
  md5hash: string
  beatmapid: number | null
  beatmapsetid: number | null
  missing: number
  resolve_status: string
  source_hint: string | null
  last_checked_at: number
}

export class DatabaseService {
  private static instance: DatabaseService
  private db: Database.Database

  private readonly getMetaStmt: Database.Statement<[string], MetaRow | undefined>
  private readonly setMetaStmt: Database.Statement<[string, string]>
  private readonly upsertBeatmapsetStmt: Database.Statement<
    [
      number,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      number,
      string | null,
      string | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number,
      number,
      number,
      number,
      string,
      number
    ]
  >
  private readonly upsertBeatmapStmt: Database.Statement<
    [
      number | null,
      number,
      string,
      number,
      string,
      string,
      string,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number | null,
      number | null,
      number | null,
      string,
      number
    ]
  >
  private readonly markBeatmapSourceStmt: Database.Statement<[string, string]>
  private readonly selectBeatmapsetByMd5Stmt: Database.Statement<[string], BeatmapSetIdRow | undefined>
  private readonly upsertCollectionMapCacheStmt: Database.Statement<
    [string, number | null, number | null, number, string, string | null, number]
  >
  private readonly selectCollectionMapCacheByMd5Stmt: Database.Statement<
    [string],
    CollectionMapCacheRow | undefined
  >
  private readonly selectPendingCollectionMapCacheStmt: Database.Statement<
    [number, number],
    CollectionMapCacheRow
  >

  private constructor() {
    const userDataPath = app.getPath('userData')
    fs.mkdirSync(userDataPath, { recursive: true })
    const dbPath = path.join(userDataPath, 'beatmaps.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    this.db.exec(CREATE_TABLES_SQL)
    this.db.exec(CREATE_INDEXES_SQL)
    this.migrate()

    this.getMetaStmt = this.db.prepare('SELECT value FROM meta WHERE key = ?')
    this.setMetaStmt = this.db.prepare(
      'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    this.upsertBeatmapsetStmt = this.db.prepare(`
      INSERT INTO beatmapsets (
        id, artist, artist_unicode, title, title_unicode, creator, source, tags, status, bpm,
        ranked_date, submitted_date, last_updated, genre_id, language_id, rating, spotlight,
        video, storyboard, is_scoreable, source_origin, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        artist = excluded.artist,
        artist_unicode = excluded.artist_unicode,
        title = excluded.title,
        title_unicode = excluded.title_unicode,
        creator = excluded.creator,
        source = excluded.source,
        tags = excluded.tags,
        status = excluded.status,
        bpm = excluded.bpm,
        ranked_date = excluded.ranked_date,
        submitted_date = excluded.submitted_date,
        last_updated = excluded.last_updated,
        genre_id = excluded.genre_id,
        language_id = excluded.language_id,
        rating = excluded.rating,
        spotlight = excluded.spotlight,
        video = excluded.video,
        storyboard = excluded.storyboard,
        is_scoreable = excluded.is_scoreable,
        source_origin = CASE
          WHEN beatmapsets.source_origin = excluded.source_origin THEN beatmapsets.source_origin
          WHEN beatmapsets.source_origin = 'both' OR excluded.source_origin = 'both' THEN 'both'
          ELSE 'both'
        END,
        last_synced_at = excluded.last_synced_at
    `)
    this.upsertBeatmapStmt = this.db.prepare(`
      INSERT INTO beatmaps (
        id, beatmapset_id, md5, mode, mode_name, status, version, difficulty_rating, total_length,
        hit_length, bpm, cs, ar, hp, od, max_combo, playcount, passcount, source_origin, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(md5) DO UPDATE SET
        id = COALESCE(excluded.id, beatmaps.id),
        beatmapset_id = excluded.beatmapset_id,
        mode = excluded.mode,
        mode_name = excluded.mode_name,
        status = excluded.status,
        version = excluded.version,
        difficulty_rating = excluded.difficulty_rating,
        total_length = excluded.total_length,
        hit_length = excluded.hit_length,
        bpm = excluded.bpm,
        cs = excluded.cs,
        ar = excluded.ar,
        hp = excluded.hp,
        od = excluded.od,
        max_combo = excluded.max_combo,
        playcount = excluded.playcount,
        passcount = excluded.passcount,
        source_origin = CASE
          WHEN beatmaps.source_origin = excluded.source_origin THEN beatmaps.source_origin
          WHEN beatmaps.source_origin = 'both' OR excluded.source_origin = 'both' THEN 'both'
          ELSE 'both'
        END,
        last_synced_at = excluded.last_synced_at
    `)
    this.markBeatmapSourceStmt = this.db.prepare(
      'UPDATE beatmaps SET source_origin = ? WHERE source_origin = ?'
    )
    this.selectBeatmapsetByMd5Stmt = this.db.prepare(
      'SELECT beatmapset_id FROM beatmaps WHERE md5 = ? LIMIT 1'
    )
    this.upsertCollectionMapCacheStmt = this.db.prepare(`
      INSERT INTO collection_map_cache (
        md5hash, beatmapid, beatmapsetid, missing, resolve_status, source_hint, last_checked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(md5hash) DO UPDATE SET
        beatmapid = excluded.beatmapid,
        beatmapsetid = excluded.beatmapsetid,
        missing = excluded.missing,
        resolve_status = excluded.resolve_status,
        source_hint = COALESCE(excluded.source_hint, collection_map_cache.source_hint),
        last_checked_at = excluded.last_checked_at
    `)
    this.selectCollectionMapCacheByMd5Stmt = this.db.prepare(
      'SELECT md5hash, beatmapid, beatmapsetid, missing, resolve_status, source_hint, last_checked_at FROM collection_map_cache WHERE md5hash = ?'
    )
    this.selectPendingCollectionMapCacheStmt = this.db.prepare(`
      SELECT md5hash, beatmapid, beatmapsetid, missing, resolve_status, source_hint, last_checked_at
      FROM collection_map_cache
      WHERE resolve_status IN ('pending', 'failed')
        AND (last_checked_at <= ?)
      ORDER BY last_checked_at ASC
      LIMIT ?
    `)
  }

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  private migrate(): void {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as
      | MetaRow
      | undefined
    const current = row ? Number(row.value) : 0
    if (!Number.isFinite(current) || current < CURRENT_SCHEMA_VERSION) {
      this.db
        .prepare(
          'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )
        .run('schema_version', String(CURRENT_SCHEMA_VERSION))
    }
  }

  getSchemaVersion(): number {
    return Number(this.getMeta('schema_version') ?? '0')
  }

  getMeta(key: string): string | null {
    const row = this.getMetaStmt.get(key)
    return row?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.setMetaStmt.run(key, value)
  }

  getCounts(): { beatmapsets: number; beatmaps: number } {
    const beatmapsets = this.db.prepare('SELECT COUNT(*) as count FROM beatmapsets').get() as {
      count: number
    }
    const beatmaps = this.db.prepare('SELECT COUNT(*) as count FROM beatmaps').get() as {
      count: number
    }
    return {
      beatmapsets: beatmapsets.count,
      beatmaps: beatmaps.count
    }
  }

  getBeatmapCountBySource(source: SyncSource): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM beatmaps WHERE source_origin = ? OR source_origin = 'both'"
      )
      .get(source) as { count: number }
    return row.count
  }

  upsertBatch(
    beatmapsets: NormalizedBeatmapsetRecord[],
    beatmaps: NormalizedBeatmapRecord[],
    syncedAt: number
  ): void {
    const tx = this.db.transaction(() => {
      for (const set of beatmapsets) {
        this.upsertBeatmapsetStmt.run(
          set.id,
          set.artist,
          set.artistUnicode,
          set.title,
          set.titleUnicode,
          set.creator,
          set.source,
          set.tags,
          set.status,
          set.bpm,
          set.rankedDate,
          set.submittedDate,
          set.lastUpdated,
          set.genreId,
          set.languageId,
          set.rating,
          set.spotlight ? 1 : 0,
          set.video ? 1 : 0,
          set.storyboard ? 1 : 0,
          set.isScoreable ? 1 : 0,
          set.sourceOrigin,
          syncedAt
        )
      }

      for (const beatmap of beatmaps) {
        this.upsertBeatmapStmt.run(
          beatmap.id,
          beatmap.beatmapsetId,
          beatmap.md5,
          beatmap.modeInt,
          beatmap.mode,
          beatmap.status,
          beatmap.version,
          beatmap.difficultyRating,
          beatmap.totalLength,
          beatmap.hitLength,
          beatmap.bpm,
          beatmap.cs,
          beatmap.ar,
          beatmap.hp,
          beatmap.od,
          beatmap.maxCombo,
          beatmap.playcount,
          beatmap.passcount,
          beatmap.sourceOrigin,
          syncedAt
        )
      }
    })

    tx()
  }

  refreshSourceTag(source: SyncSource): void {
    const oppositeSource = source === 'stable' ? 'lazer' : 'stable'
    this.markBeatmapSourceStmt.run(oppositeSource, 'both')
  }

  filterBeatmaps(body: unknown): BeatmapFilterResult {
    return runBeatmapFilter(this.db, body)
  }

  getBeatmapsetIdByMd5(md5: string): number | null {
    const row = this.selectBeatmapsetByMd5Stmt.get(md5)
    return row?.beatmapset_id ?? null
  }

  getCollectionMapCacheByMd5(md5: string): CollectionMapCacheRecord | null {
    const row = this.selectCollectionMapCacheByMd5Stmt.get(md5)
    if (!row) return null
    return {
      md5hash: row.md5hash,
      beatmapid: row.beatmapid,
      beatmapsetid: row.beatmapsetid,
      missing: row.missing === 1,
      resolveStatus: row.resolve_status as CollectionResolveStatus,
      sourceHint: row.source_hint,
      lastCheckedAt: row.last_checked_at
    }
  }

  upsertCollectionMapCache(record: CollectionMapCacheRecord): void {
    this.upsertCollectionMapCacheStmt.run(
      record.md5hash,
      record.beatmapid,
      record.beatmapsetid,
      record.missing ? 1 : 0,
      record.resolveStatus,
      record.sourceHint,
      record.lastCheckedAt
    )
  }

  upsertCollectionMapCacheBatch(records: CollectionMapCacheRecord[]): void {
    if (records.length === 0) return
    const tx = this.db.transaction((rows: CollectionMapCacheRecord[]) => {
      for (const record of rows) {
        this.upsertCollectionMapCacheStmt.run(
          record.md5hash,
          record.beatmapid,
          record.beatmapsetid,
          record.missing ? 1 : 0,
          record.resolveStatus,
          record.sourceHint,
          record.lastCheckedAt
        )
      }
    })
    tx(records)
  }

  getCollectionMapCachePendingForSync(options?: {
    limit?: number
    retryBeforeMs?: number
  }): CollectionMapCacheRecord[] {
    const limit = options?.limit ?? 50
    const retryBeforeMs = options?.retryBeforeMs ?? Date.now()
    return this.selectPendingCollectionMapCacheStmt.all(retryBeforeMs, limit).map((row) => ({
      md5hash: row.md5hash,
      beatmapid: row.beatmapid,
      beatmapsetid: row.beatmapsetid,
      missing: row.missing === 1,
      resolveStatus: row.resolve_status as CollectionResolveStatus,
      sourceHint: row.source_hint,
      lastCheckedAt: row.last_checked_at
    }))
  }

  getCollectionSyncStats(): {
    pending: number
    resolved: number
    notFound: number
    failed: number
    missingLocal: number
  } {
    const row = this.db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN resolve_status = 'pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN resolve_status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
          SUM(CASE WHEN resolve_status = 'notFound' THEN 1 ELSE 0 END) AS notFound,
          SUM(CASE WHEN resolve_status = 'failed' THEN 1 ELSE 0 END) AS failed,
          SUM(CASE WHEN missing = 1 THEN 1 ELSE 0 END) AS missingLocal
        FROM collection_map_cache
      `
      )
      .get() as {
      pending: number | null
      resolved: number | null
      notFound: number | null
      failed: number | null
      missingLocal: number | null
    }
    return {
      pending: row.pending ?? 0,
      resolved: row.resolved ?? 0,
      notFound: row.notFound ?? 0,
      failed: row.failed ?? 0,
      missingLocal: row.missingLocal ?? 0
    }
  }
}
