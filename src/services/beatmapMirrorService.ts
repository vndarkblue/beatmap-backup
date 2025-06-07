import { DefaultBeatmapMirrors, BeatmapMirror } from '../config/beatmapMirrors'
import fetch from 'node-fetch'

interface MirrorStatus {
  name: string
  isOnline: boolean
  lastChecked: number
  error?: string
}

class BeatmapMirrorService {
  private static instance: BeatmapMirrorService
  private statusCache: Map<string, MirrorStatus>
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5 minutes in milliseconds

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
    try {
      const response = await fetch(mirror.healthUrl)
      const isOnline = response.ok
      return {
        name: mirror.name,
        isOnline,
        lastChecked: Date.now(),
        error: isOnline ? undefined : `HTTP ${response.status}`
      }
    } catch (error) {
      return {
        name: mirror.name,
        isOnline: false,
        lastChecked: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private isCacheValid(status: MirrorStatus): boolean {
    return Date.now() - status.lastChecked < this.CACHE_DURATION
  }

  public async getMirrorsStatus(): Promise<MirrorStatus[]> {
    const results: MirrorStatus[] = []
    const mirrors = DefaultBeatmapMirrors

    for (const mirror of mirrors) {
      const cachedStatus = this.statusCache.get(mirror.name)

      if (cachedStatus && this.isCacheValid(cachedStatus)) {
        results.push(cachedStatus)
      } else {
        const status = await this.checkMirrorStatus(mirror)
        this.statusCache.set(mirror.name, status)
        results.push(status)
      }
    }

    return results
  }

  public clearCache(): void {
    this.statusCache.clear()
  }
}

export default BeatmapMirrorService
