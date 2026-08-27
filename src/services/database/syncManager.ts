import { EventEmitter } from 'events'
import fs from 'fs'
import { DatabaseService } from './databaseService'
import { getStableDbPath, importFromStableDb } from './stableImporter'
import { importFromLazerRealm } from './lazerImporter'
import { realmService } from '../realmService'
import { getOsuLazerPath, getOsuStablePath } from '../settingsStore'
import type { DatabaseStatus, SyncProgressEvent, SyncSource } from './types'
import { startupMark } from '../startupTrace'
import { isOsuProcessRunning } from '../processDetector'

class SyncManager extends EventEmitter {
  private static instance: SyncManager
  private runningSources = new Set<SyncSource>()

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager()
    }
    return SyncManager.instance
  }

  private backgroundTimer: NodeJS.Timeout | null = null
  private readonly AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000

  startBackgroundSync(intervalMs = this.AUTO_SYNC_INTERVAL_MS): void {
    if (this.backgroundTimer) return
    this.backgroundTimer = setInterval(() => {
      void this.runPeriodicSync()
    }, intervalMs)
  }

  stopBackgroundSync(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer)
      this.backgroundTimer = null
    }
  }

  async runPeriodicSync(): Promise<void> {
    await this.syncSource('stable', false)
    await this.syncSource('lazer', false)
  }

  async runStartupSync(): Promise<void> {
    startupMark('db:startupSync:begin')

    // Stable startup sync
    const stableProc = await isOsuProcessRunning('stable')
    if (stableProc.running) {
      this.emitSyncEvent({
        source: 'stable',
        phase: 'skipped',
        message: 'osu!stable is currently running'
      })
    } else {
      await this.syncSource('stable', false)
    }

    startupMark('db:startupSync:afterStable')

    // Lazer startup sync
    const lazerProc = await isOsuProcessRunning('lazer')
    if (lazerProc.running) {
      this.emitSyncEvent({
        source: 'lazer',
        phase: 'skipped',
        message: 'osu!lazer is currently running'
      })
    } else {
      await this.syncSource('lazer', false)
    }

    startupMark('db:startupSync:done')
  }

  async runManualSync(source: SyncSource | 'all', force = true): Promise<void> {
    if (source === 'all') {
      await this.syncSource('stable', force)
      await this.syncSource('lazer', force)
      return
    }
    await this.syncSource(source, force)
  }

  getStatus(): DatabaseStatus {
    const db = DatabaseService.getInstance()
    const stablePath = getStableDbPath()
    const lazerConfiguredPath = getOsuLazerPath()
    let lazerPath: string | null = null
    if (lazerConfiguredPath) {
      try {
        lazerPath = realmService.getRealmPath()
      } catch {
        lazerPath = null
      }
    }

    const stableCurrentMtime =
      stablePath && fs.existsSync(stablePath) ? fs.statSync(stablePath).mtimeMs : null
    const lazerCurrentMtime =
      lazerPath && fs.existsSync(lazerPath) ? fs.statSync(lazerPath).mtimeMs : null

    const stableLastMtime = Number(db.getMeta('last_sync_stable_mtime') ?? '0') || null
    const lazerLastMtime = Number(db.getMeta('last_sync_lazer_mtime') ?? '0') || null
    const stableLastSyncAt = Number(db.getMeta('last_sync_stable_at') ?? '0') || null
    const lazerLastSyncAt = Number(db.getMeta('last_sync_lazer_at') ?? '0') || null

    const totals = db.getCounts()

    return {
      schemaVersion: db.getSchemaVersion(),
      totals,
      stable: {
        configured: Boolean(getOsuStablePath()),
        fileExists: Boolean(stablePath),
        lastSyncAt: stableLastSyncAt,
        lastFileMtime: stableLastMtime,
        currentFileMtime: stableCurrentMtime,
        beatmapCount: db.getBeatmapCountBySource('stable'),
        isDirty: Boolean(
          stableCurrentMtime && stableLastMtime && stableCurrentMtime !== stableLastMtime
        )
      },
      lazer: {
        configured: Boolean(lazerConfiguredPath),
        fileExists: Boolean(lazerPath && fs.existsSync(lazerPath)),
        lastSyncAt: lazerLastSyncAt,
        lastFileMtime: lazerLastMtime,
        currentFileMtime: lazerCurrentMtime,
        beatmapCount: db.getBeatmapCountBySource('lazer'),
        // For lazer, do not use mtime to determine dirty state.
        // It is considered dirty only if configured and has never been synced.
        isDirty: Boolean(lazerConfiguredPath && !lazerLastSyncAt)
      }
    }
  }

  private emitSyncEvent(payload: SyncProgressEvent): void {
    this.emit('sync', payload)
  }

  private async syncSource(source: SyncSource, force: boolean): Promise<void> {
    if (this.runningSources.has(source)) {
      this.emitSyncEvent({
        source,
        phase: 'skipped',
        message: 'Sync already running'
      })
      return
    }

    this.runningSources.add(source)
    const startedAt = Date.now()
    const db = DatabaseService.getInstance()

    try {
      // Check if osu! process is running
      const procCheck = await isOsuProcessRunning(source)
      if (procCheck.running) {
        if (force) {
          this.emitSyncEvent({
            source,
            phase: 'error',
            error: `Cannot sync: osu!${source === 'lazer' ? 'lazer' : 'stable'} is currently running. Please close the game first.`
          })
          return
        } else {
          this.emitSyncEvent({
            source,
            phase: 'skipped',
            message: `osu!${source === 'lazer' ? 'lazer' : 'stable'} is currently running`
          })
          return
        }
      }

      const filePath = source === 'stable' ? getStableDbPath() : realmService.getRealmPath()
      if (!filePath || !fs.existsSync(filePath)) {
        this.emitSyncEvent({
          source,
          phase: 'skipped',
          message: 'Source file not found'
        })
        return
      }

      const currentMtime = fs.statSync(filePath).mtimeMs
      const lastMtime = Number(db.getMeta(`last_sync_${source}_mtime`) ?? '0')

      if (!force) {
        if (source === 'stable' && lastMtime === currentMtime) {
          this.emitSyncEvent({
            source,
            phase: 'skipped',
            message: 'Source unchanged'
          })
          return
        }
      }

      this.emitSyncEvent({
        source,
        phase: 'started',
        message: `Sync started for ${source}`
      })

      const result =
        source === 'stable'
          ? await importFromStableDb((processed, total) =>
              this.emitSyncEvent({ source, phase: 'progress', processed, total })
            )
          : await importFromLazerRealm((processed, total) =>
              this.emitSyncEvent({ source, phase: 'progress', processed, total })
            )

      const completedAt = Date.now()
      db.setMeta(`last_sync_${source}_mtime`, String(currentMtime))
      db.setMeta(`last_sync_${source}_at`, String(completedAt))
      db.setMeta(`last_sync_${source}_count`, String(result.beatmaps))

      this.emitSyncEvent({
        source,
        phase: 'completed',
        processed: result.beatmaps,
        total: result.beatmaps,
        durationMs: completedAt - startedAt,
        message: `Imported ${result.beatmaps} beatmaps`
      })
    } catch (error) {
      this.emitSyncEvent({
        source,
        phase: 'error',
        error: error instanceof Error ? error.message : 'Unknown sync error'
      })
    } finally {
      this.runningSources.delete(source)
    }
  }
}

export default SyncManager
