import { DatabaseService } from '../database/databaseService'
import { resolveMd5FromOsuDirect } from './osuDirectService'
import { is } from '../../utils/env'
import type { CollectionSyncStatus } from './types'

const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000
const RETRY_BACKOFF_MS = 30 * 60 * 1000
const BATCH_SIZE = 25
const MANUAL_SYNC_COOLDOWN_MS = 5 * 1000
const INITIAL_SYNC_DELAY_MS = 60 * 1000

export interface CollectionSyncRunSummary {
  processed: number
  resolved: number
  notFound: number
  failed: number
}

class CollectionSyncService {
  private static instance: CollectionSyncService
  private timer: NodeJS.Timeout | null = null
  private initialTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private lastManualSyncAt = 0
  private lastRunSummary: CollectionSyncRunSummary = {
    processed: 0,
    resolved: 0,
    notFound: 0,
    failed: 0
  }

  static getInstance(): CollectionSyncService {
    if (!CollectionSyncService.instance) {
      CollectionSyncService.instance = new CollectionSyncService()
    }
    return CollectionSyncService.instance
  }

  startBackgroundSync(): void {
    if (this.timer || this.initialTimer) return
    const db = DatabaseService.getInstance()
    const pendingCount =
      typeof db.getPendingCollectionMapCacheCount === 'function'
        ? db.getPendingCollectionMapCacheCount()
        : db.getCollectionSyncStats().pending
    if (pendingCount === 0) {
      if (is.dev) {
        console.log('[CollectionSync] No pending MD5s to resolve, idle')
      }
      return
    }

    this.initialTimer = setTimeout(() => {
      this.initialTimer = null
      void this.syncMissingMd5s()
    }, INITIAL_SYNC_DELAY_MS)
    this.timer = setInterval(() => {
      void this.syncMissingMd5s()
    }, AUTO_SYNC_INTERVAL_MS)
  }

  stopBackgroundSync(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer)
      this.initialTimer = null
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getStatus(): CollectionSyncStatus {
    const db = DatabaseService.getInstance()
    const stats = db.getCollectionSyncStats()
    return {
      ...stats,
      lastRunAt: Number(db.getMeta('collection_sync_last_run_at') ?? '0') || null,
      running: this.isRunning
    }
  }

  getLastRunSummary(): CollectionSyncRunSummary {
    return { ...this.lastRunSummary }
  }

  async requestManualSync(): Promise<{
    executed: boolean
    reason?: 'running' | 'cooldown'
    retryAfterMs?: number
  }> {
    if (this.isRunning) {
      return { executed: false, reason: 'running', retryAfterMs: 1000 }
    }
    const now = Date.now()
    const elapsed = now - this.lastManualSyncAt
    if (elapsed < MANUAL_SYNC_COOLDOWN_MS) {
      return {
        executed: false,
        reason: 'cooldown',
        retryAfterMs: MANUAL_SYNC_COOLDOWN_MS - elapsed
      }
    }

    this.lastManualSyncAt = now
    await this.syncMissingMd5s()
    return { executed: true }
  }

  async syncMissingMd5s(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    const db = DatabaseService.getInstance()
    db.setMeta('collection_sync_running', '1')

    try {
      const now = Date.now()
      const retryBefore = now - RETRY_BACKOFF_MS
      const rows = db.getCollectionMapCachePendingForSync({
        limit: BATCH_SIZE,
        retryBeforeMs: retryBefore
      })
      const runSummary: CollectionSyncRunSummary = {
        processed: 0,
        resolved: 0,
        notFound: 0,
        failed: 0
      }

      for (const row of rows) {
        runSummary.processed += 1
        try {
          const resolved = await resolveMd5FromOsuDirect(row.md5hash)
          if (resolved?.beatmapsetId) {
            runSummary.resolved += 1
            db.upsertCollectionMapCache({
              md5hash: row.md5hash,
              beatmapid: resolved.beatmapId ?? row.beatmapid,
              beatmapsetid: resolved.beatmapsetId,
              missing: row.missing,
              resolveStatus: 'resolved',
              sourceHint: row.sourceHint,
              lastCheckedAt: Date.now()
            })
          } else {
            runSummary.notFound += 1
            db.upsertCollectionMapCache({
              md5hash: row.md5hash,
              beatmapid: row.beatmapid,
              beatmapsetid: row.beatmapsetid,
              missing: row.missing,
              resolveStatus: 'notFound',
              sourceHint: row.sourceHint,
              lastCheckedAt: Date.now()
            })
          }
        } catch {
          runSummary.failed += 1
          db.upsertCollectionMapCache({
            md5hash: row.md5hash,
            beatmapid: row.beatmapid,
            beatmapsetid: row.beatmapsetid,
            missing: row.missing,
            resolveStatus: 'failed',
            sourceHint: row.sourceHint,
            lastCheckedAt: Date.now()
          })
        }
      }
      this.lastRunSummary = runSummary
      if (is.dev) console.info('collection sync summary', runSummary)
      const remainingPending =
        typeof db.getPendingCollectionMapCacheCount === 'function'
          ? db.getPendingCollectionMapCacheCount()
          : (db.getCollectionSyncStats?.()?.pending ?? 0)
      if (remainingPending === 0) {
        this.stopBackgroundSync()
      }
    } finally {
      this.isRunning = false
      db.setMeta('collection_sync_running', '0')
      db.setMeta('collection_sync_last_run_at', String(Date.now()))
    }
  }
}

export default CollectionSyncService
