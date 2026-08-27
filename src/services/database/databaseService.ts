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
      string,
      number
    ]
  >
  private readonly markBeatmapSourceStmt: Database.Statement<[string, string]>
  private readonly selectBeatmapsetByMd5Stmt: Database.Statement<
    [string],
    BeatmapSetIdRow | undefined
  >
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
        artist = CASE WHEN excluded.artist != '' THEN excluded.artist ELSE beatmapsets.artist END,
        artist_unicode = CASE WHEN excluded.artist_unicode != '' THEN excluded.artist_unicode ELSE beatmapsets.artist_unicode END,
        title = CASE WHEN excluded.title != '' THEN excluded.title ELSE beatmapsets.title END,
        title_unicode = CASE WHEN excluded.title_unicode != '' THEN excluded.title_unicode ELSE beatmapsets.title_unicode END,
        creator = CASE WHEN excluded.creator != '' THEN excluded.creator ELSE beatmapsets.creator END,
        source = CASE WHEN excluded.source != '' THEN excluded.source ELSE beatmapsets.source END,
        tags = CASE WHEN excluded.tags != '' THEN excluded.tags ELSE beatmapsets.tags END,
        status = CASE WHEN excluded.status != '' AND excluded.status != 'unranked' THEN excluded.status ELSE beatmapsets.status END,
        bpm = CASE WHEN excluded.bpm > 0 THEN excluded.bpm ELSE beatmapsets.bpm END,
        ranked_date = COALESCE(excluded.ranked_date, beatmapsets.ranked_date),
        submitted_date = COALESCE(excluded.submitted_date, beatmapsets.submitted_date),
        last_updated = COALESCE(excluded.last_updated, beatmapsets.last_updated),
        genre_id = COALESCE(excluded.genre_id, beatmapsets.genre_id),
        language_id = COALESCE(excluded.language_id, beatmapsets.language_id),
        rating = COALESCE(excluded.rating, beatmapsets.rating),
        spotlight = CASE WHEN excluded.spotlight != 0 THEN excluded.spotlight ELSE beatmapsets.spotlight END,
        video = CASE WHEN excluded.video != 0 THEN excluded.video ELSE beatmapsets.video END,
        storyboard = CASE WHEN excluded.storyboard != 0 THEN excluded.storyboard ELSE beatmapsets.storyboard END,
        is_scoreable = CASE WHEN excluded.is_scoreable != 0 THEN excluded.is_scoreable ELSE beatmapsets.is_scoreable END,
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
        hit_length, bpm, cs, ar, hp, od, max_combo, playcount, passcount, source_origin, metrics_source, last_synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(md5) DO UPDATE SET
        id = COALESCE(excluded.id, beatmaps.id),
        beatmapset_id = excluded.beatmapset_id,
        mode = excluded.mode,
        mode_name = excluded.mode_name,
        status = excluded.status,
        version = excluded.version,
        difficulty_rating = CASE
          WHEN excluded.source_origin = 'lazer' AND excluded.difficulty_rating > 0 THEN excluded.difficulty_rating
          WHEN beatmaps.difficulty_rating > 0 THEN beatmaps.difficulty_rating
          ELSE excluded.difficulty_rating
        END,
        total_length = CASE WHEN excluded.total_length > 0 THEN excluded.total_length ELSE beatmaps.total_length END,
        hit_length = CASE WHEN excluded.hit_length > 0 THEN excluded.hit_length ELSE beatmaps.hit_length END,
        bpm = CASE WHEN excluded.bpm > 0 THEN excluded.bpm ELSE beatmaps.bpm END,
        cs = excluded.cs,
        ar = excluded.ar,
        hp = excluded.hp,
        od = excluded.od,
        max_combo = COALESCE(excluded.max_combo, beatmaps.max_combo),
        playcount = COALESCE(excluded.playcount, beatmaps.playcount),
        passcount = COALESCE(excluded.passcount, beatmaps.passcount),
        source_origin = CASE
          WHEN beatmaps.source_origin = excluded.source_origin THEN beatmaps.source_origin
          WHEN beatmaps.source_origin = 'both' OR excluded.source_origin = 'both' THEN 'both'
          ELSE 'both'
        END,
        metrics_source = CASE
          WHEN excluded.source_origin = 'stable' AND excluded.playcount IS NOT NULL THEN 'stable'
          WHEN excluded.source_origin = 'lazer' AND excluded.difficulty_rating > 0 THEN 'lazer'
          ELSE COALESCE(beatmaps.metrics_source, excluded.metrics_source)
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
    if (current < 3) {
      const tableInfo = this.db.pragma('table_info(beatmaps)') as Array<{ name: string }>
      const hasMetricsSource = tableInfo.some((col) => col.name === 'metrics_source')
      if (!hasMetricsSource) {
        this.db.exec("ALTER TABLE beatmaps ADD COLUMN metrics_source TEXT NOT NULL DEFAULT 'stable'")
      }
    }
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

  hasSyncedData(source: SyncSource): boolean {
    return this.getBeatmapCountBySource(source) > 0
  }

  getExistingBeatmapsetIds(sources: { stable?: boolean; lazer?: boolean }): Set<number> {
    const ids = new Set<number>()
    if (sources.stable && sources.lazer) {
      const rows = this.db.prepare('SELECT id FROM beatmapsets').all() as Array<{ id: number }>
      for (const row of rows) {
        ids.add(row.id)
      }
    } else if (sources.stable) {
      const rows = this.db
        .prepare("SELECT id FROM beatmapsets WHERE source_origin IN ('stable', 'both')")
        .all() as Array<{ id: number }>
      for (const row of rows) {
        ids.add(row.id)
      }
    } else if (sources.lazer) {
      const rows = this.db
        .prepare("SELECT id FROM beatmapsets WHERE source_origin IN ('lazer', 'both')")
        .all() as Array<{ id: number }>
      for (const row of rows) {
        ids.add(row.id)
      }
    }
    return ids
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
          beatmap.metricsSource ?? beatmap.sourceOrigin,
          syncedAt
        )
      }
    })

    tx()
  }

  async upsertBatchAsync(
    beatmapsets: NormalizedBeatmapsetRecord[],
    beatmaps: NormalizedBeatmapRecord[],
    syncedAt: number,
    chunkSize = 2500
  ): Promise<void> {
    for (let i = 0; i < beatmapsets.length; i += chunkSize) {
      const slice = beatmapsets.slice(i, i + chunkSize)
      const tx = this.db.transaction((sets: NormalizedBeatmapsetRecord[]) => {
        for (const set of sets) {
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
      })
      tx(slice)
      if (i + chunkSize < beatmapsets.length) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    for (let i = 0; i < beatmaps.length; i += chunkSize) {
      const slice = beatmaps.slice(i, i + chunkSize)
      const tx = this.db.transaction((bms: NormalizedBeatmapRecord[]) => {
        for (const beatmap of bms) {
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
            beatmap.metricsSource ?? beatmap.sourceOrigin,
            syncedAt
          )
        }
      })
      tx(slice)
      if (i + chunkSize < beatmaps.length) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }
  }

  getPendingCollectionMapCacheCount(): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM collection_map_cache WHERE resolve_status IN ('pending', 'failed')"
      )
      .get() as { count: number }
    return row.count
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
