import { DefaultBeatmapMirrors, BeatmapMirror } from '../config/beatmapMirrors'
import fetch from 'node-fetch'
import { is } from '@electron-toolkit/utils'

export interface MirrorStatus {
  name: string
  isOnline: boolean
  lastChecked: number
  responseTimeMs: number | null
  error?: string
}

class BeatmapMirrorService {
  private static instance: BeatmapMirrorService
  private statusCache: Map<string, MirrorStatus>
  private readonly CACHE_DURATION = 5 * 60 * 1000
  private readonly REQUEST_TIMEOUT = 3000
  private readonly BACKGROUND_REFRESH_INTERVAL = 5 * 60 * 1000
  private backgroundRefreshTimer?: NodeJS.Timeout

  private constructor() {
    this.statusCache = new Map()
  }

  public static getInstance(): BeatmapMirrorService {
    if (!BeatmapMirrorService.instance) {
      BeatmapMirrorService.instance = new BeatmapMirrorService()
    }
    return BeatmapMirrorService.instance
  }

  private async checkMirrorStatus(mirror: BeatmapMirror): Promise<MirrorStatus> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT)
    const start = Date.now()

    try {
      const response = await fetch(mirror.healthUrl, { signal: controller.signal })
      const isOnline = response.ok
      const status: MirrorStatus = {
        name: mirror.name,
        isOnline,
        lastChecked: Date.now(),
        responseTimeMs: Date.now() - start,
        error: isOnline ? undefined : `HTTP ${response.status}`
      }
      if (is.dev) {
        console.log(
          `[MirrorHealth] check ${mirror.name}: ${isOnline ? 'online' : 'offline'}` +
            ` http=${response.status} rt=${status.responseTimeMs}ms url=${mirror.healthUrl}` +
            (status.error ? ` error=${status.error}` : '')
        )
      }
      return status
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'Health check timeout'
          : error instanceof Error
            ? error.message
            : 'Unknown error'
      const status: MirrorStatus = {
        name: mirror.name,
        isOnline: false,
        lastChecked: Date.now(),
        responseTimeMs: null,
        error: message
      }
      if (is.dev) {
        console.log(
          `[MirrorHealth] check ${mirror.name}: offline rt=null url=${mirror.healthUrl} error=${message}`
        )
      }
      return status
    } finally {
      clearTimeout(timeout)
    }
  }

  private isCacheValid(status: MirrorStatus): boolean {
    return Date.now() - status.lastChecked < this.CACHE_DURATION
  }

  public async getMirrorsStatus(): Promise<MirrorStatus[]> {
    const results: MirrorStatus[] = []
    const mirrors = DefaultBeatmapMirrors
    let cacheHits = 0
    let freshChecks = 0

    for (const mirror of mirrors) {
      const cachedStatus = this.statusCache.get(mirror.name)

      if (cachedStatus && this.isCacheValid(cachedStatus)) {
        cacheHits++
        if (is.dev) {
          console.log(
            `[MirrorHealth] cache-hit ${mirror.name}: ${cachedStatus.isOnline ? 'online' : 'offline'}` +
              ` age=${Date.now() - cachedStatus.lastChecked}ms` +
              (cachedStatus.error ? ` error=${cachedStatus.error}` : '')
          )
        }
        results.push(cachedStatus)
      } else {
        freshChecks++
        const status = await this.checkMirrorStatus(mirror)
        this.statusCache.set(mirror.name, status)
        results.push(status)
      }
    }

    if (is.dev) {
      console.log(
        `[MirrorHealth] getMirrorsStatus done cacheHits=${cacheHits} freshChecks=${freshChecks}` +
          ` online=${results.filter((s) => s.isOnline).map((s) => s.name).join(',') || '(none)'}` +
          ` offline=${results.filter((s) => !s.isOnline).map((s) => `${s.name}(${s.error ?? '?'})`).join(',') || '(none)'}`
      )
    }

    return results
  }

  public async refreshStatusCache(): Promise<void> {
    if (is.dev) console.log('[MirrorHealth] background refresh start')
    const checks = await Promise.all(
      DefaultBeatmapMirrors.map((mirror) => this.checkMirrorStatus(mirror))
    )
    for (const status of checks) {
      this.statusCache.set(status.name, status)
    }
    if (is.dev) {
      console.log(
        `[MirrorHealth] background refresh done` +
          ` online=${checks.filter((s) => s.isOnline).map((s) => s.name).join(',') || '(none)'}` +
          ` offline=${checks.filter((s) => !s.isOnline).map((s) => `${s.name}(${s.error ?? '?'})`).join(',') || '(none)'}`
      )
    }
  }

  public async getHealthyMirrorNames(): Promise<Set<string>> {
    const statuses = await this.getMirrorsStatus()
    const healthy = new Set(statuses.filter((s) => s.isOnline).map((s) => s.name))
    if (is.dev) {
      console.log(
        `[MirrorHealth] getHealthyMirrorNames → [${[...healthy].join(', ') || 'none'}]` +
          ` (${healthy.size}/${statuses.length})`
      )
    }
    return healthy
  }

  public startBackgroundHealthChecks(): void {
    if (this.backgroundRefreshTimer) {
      return
    }
    void this.refreshStatusCache()
    this.backgroundRefreshTimer = setInterval(() => {
      void this.refreshStatusCache()
    }, this.BACKGROUND_REFRESH_INTERVAL)
  }

  public stopBackgroundHealthChecks(): void {
    if (!this.backgroundRefreshTimer) {
      return
    }
    clearInterval(this.backgroundRefreshTimer)
    this.backgroundRefreshTimer = undefined
  }

  public clearCache(): void {
    this.statusCache.clear()
  }
}

export default BeatmapMirrorService
