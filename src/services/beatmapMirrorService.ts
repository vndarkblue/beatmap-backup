import { DefaultBeatmapMirrors, BeatmapMirror } from '../config/beatmapMirrors'
import { is } from '../utils/env'

export const MINO_MIRROR_NAME = 'catboy.best'

export interface MirrorStatus {
  name: string
  isOnline: boolean
  lastChecked: number
  responseTimeMs: number | null
  error?: string
  isWarpBlocked?: boolean
}

class BeatmapMirrorService {
  private static instance: BeatmapMirrorService
  private statusCache: Map<string, MirrorStatus>
  private readonly CACHE_DURATION = 5 * 60 * 1000
  private readonly REQUEST_TIMEOUT = 3000
  private warpStatusCache: { isWarp: boolean; checkedAt: number } | null = null
  private readonly WARP_CACHE_DURATION = 15 * 1000
  private readonly WARP_TRACE_TIMEOUT = 2500
  private isWarpActiveOverride: boolean | null = null

  private constructor() {
    this.statusCache = new Map()
  }

  public static getInstance(): BeatmapMirrorService {
    if (!BeatmapMirrorService.instance) {
      BeatmapMirrorService.instance = new BeatmapMirrorService()
    }
    return BeatmapMirrorService.instance
  }

  public setWarpActiveForTest(active: boolean | null): void {
    this.isWarpActiveOverride = active
  }

  public async isCloudflareWarpActive(forceRefresh = false): Promise<boolean> {
    if (this.isWarpActiveOverride !== null) {
      return this.isWarpActiveOverride
    }
    const now = Date.now()
    if (
      !forceRefresh &&
      this.warpStatusCache &&
      now - this.warpStatusCache.checkedAt < this.WARP_CACHE_DURATION
    ) {
      return this.warpStatusCache.isWarp
    }

    const checkTrace = async (url: string): Promise<boolean | null> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.WARP_TRACE_TIMEOUT)
      try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) return null
        if (typeof response.text === 'function') {
          const text = await response.text()
          return /warp=(on|plus)/i.test(text)
        }
        return false
      } catch {
        return null
      } finally {
        clearTimeout(timeout)
      }
    }

    let isWarp = await checkTrace('https://www.cloudflare.com/cdn-cgi/trace')
    if (isWarp === null) {
      isWarp = await checkTrace('https://1.1.1.1/cdn-cgi/trace')
    }

    const result = isWarp ?? false
    this.warpStatusCache = { isWarp: result, checkedAt: now }
    if (is.dev && result) {
      console.log('[MirrorHealth] Cloudflare WARP detected as active')
    }
    return result
  }

  private async checkMirrorStatus(mirror: BeatmapMirror): Promise<MirrorStatus> {
    if (mirror.name === MINO_MIRROR_NAME) {
      const isWarp = await this.isCloudflareWarpActive()
      if (isWarp) {
        const status: MirrorStatus = {
          name: mirror.name,
          isOnline: false,
          lastChecked: Date.now(),
          responseTimeMs: null,
          error: 'Cloudflare WARP detected (banned by Mino)',
          isWarpBlocked: true
        }
        if (is.dev) {
          console.log(`[MirrorHealth] check ${mirror.name}: disabled due to active Cloudflare WARP`)
        }
        return status
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT)
    const start = Date.now()

    const healthUrl = mirror.getHealthUrl?.() ?? mirror.healthUrl
    const healthHeaders: Record<string, string> = {
      'User-Agent': 'osu-beatmap-backup/1.0',
      ...(mirror.getHealthHeaders?.() ?? {})
    }

    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        headers: healthHeaders
      })
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
            ` http=${response.status} rt=${status.responseTimeMs}ms url=${healthUrl}` +
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

  public async getMirrorsStatus(forceRefresh = false): Promise<MirrorStatus[]> {
    const now = Date.now()
    const mirrors = DefaultBeatmapMirrors

    const isWarp = await this.isCloudflareWarpActive(forceRefresh)
    const minoCached = this.statusCache.get(MINO_MIRROR_NAME)
    if (minoCached) {
      const wasWarpBlocked =
        minoCached.isWarpBlocked || minoCached.error?.includes('Cloudflare WARP')
      if ((isWarp && !wasWarpBlocked) || (!isWarp && wasWarpBlocked)) {
        this.statusCache.delete(MINO_MIRROR_NAME)
      }
    }

    const mirrorsToCheck = mirrors.filter((mirror) => {
      if (forceRefresh) return true
      const cached = this.statusCache.get(mirror.name)
      return !cached || !this.isCacheValid(cached)
    })

    if (mirrorsToCheck.length > 0) {
      const freshStatuses = await Promise.all(
        mirrorsToCheck.map((mirror) => this.checkMirrorStatus(mirror))
      )
      for (const status of freshStatuses) {
        this.statusCache.set(status.name, status)
      }
    }

    const results = mirrors.map((m) => {
      return (
        this.statusCache.get(m.name) ?? {
          name: m.name,
          isOnline: false,
          lastChecked: now,
          responseTimeMs: null,
          error: 'Unchecked'
        }
      )
    })

    if (is.dev) {
      console.log(
        `[MirrorHealth] getMirrorsStatus checked=${mirrorsToCheck.length}/${mirrors.length}` +
          ` online=${
            results
              .filter((s) => s.isOnline)
              .map((s) => s.name)
              .join(',') || '(none)'
          }` +
          ` offline=${
            results
              .filter((s) => !s.isOnline)
              .map((s) => `${s.name}(${s.error ?? '?'})`)
              .join(',') || '(none)'
          }`
      )
    }

    return results
  }

  public async getHealthyMirrorNames(forceRefresh = false): Promise<Set<string>> {
    const statuses = await this.getMirrorsStatus(forceRefresh)
    const healthy = new Set(statuses.filter((s) => s.isOnline).map((s) => s.name))
    if (is.dev) {
      console.log(
        `[MirrorHealth] getHealthyMirrorNames → [${[...healthy].join(', ') || 'none'}]` +
          ` (${healthy.size}/${statuses.length})`
      )
    }
    return healthy
  }

  /** Reset internal singleton for isolated test runs. */
  public static resetInstanceForTest(): void {
    BeatmapMirrorService.instance = new BeatmapMirrorService()
  }
}

export default BeatmapMirrorService
