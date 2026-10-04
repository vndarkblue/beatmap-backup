import os from 'os'
import { app, net } from 'electron'
import { isPortableMode } from '../main/portable'
import { getAnonymousDistinctId, getTelemetryEnabled } from './settingsStore'
import { logger } from './logger'

export interface MinimalPingPayload {
  distinctId: string
  appVersion: string
  osPlatform: string
  osRelease: string
  osArch: string
  isPortable: boolean
  telemetryMode: 'minimal'
  timestamp: number
}

export interface FullTelemetryEventPayload {
  distinctId: string
  appVersion: string
  osPlatform: string
  osRelease: string
  osArch: string
  isPortable: boolean
  telemetryMode: 'full'
  eventName: string
  properties: Record<string, string | number | boolean>
  timestamp: number
}

export type TelemetryPayload = MinimalPingPayload | FullTelemetryEventPayload

export const DEFAULT_TELEMETRY_ENDPOINT =
  process.env.TELEMETRY_ENDPOINT || 'https://telemetry.osu-beatmap-backup.local/api/v1/events'

export const DISPATCH_INTERVAL_MS = 60_000 // 60 seconds
export const MAX_QUEUE_SIZE = 100
export const MAX_BATCH_SIZE = 25
export const REQUEST_TIMEOUT_MS = 5_000 // 5 seconds

/**
 * Sanitizes filesystem paths by removing personal user names.
 * Converts 'C:\Users\JohnDoe\...' into 'C:\Users\[REDACTED]\...'
 * and '/Users/john/...' or '/home/john/...' into '/Users/[REDACTED]/...'
 */
export function sanitizePath(input: string): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .replace(/([a-zA-Z]:\\Users\\)[^\\]+/gi, '$1[REDACTED]')
    .replace(/(\/(?:Users|home)\/)[^/]+/gi, '$1[REDACTED]')
}

/**
 * Sanitizes arbitrary properties passed with a telemetry event.
 * Strips non-primitive types, redacts personal paths in string values,
 * and limits string lengths to prevent payload bloat.
 */
export function sanitizeProperties(
  props?: Record<string, unknown>
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  if (!props || typeof props !== 'object') {
    return result
  }

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string') {
      const sanitized = sanitizePath(value)
      result[key] = sanitized.length > 500 ? `${sanitized.slice(0, 500)}...` : sanitized
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
    }
  }

  return result
}

export class TelemetryService {
  private static instance: TelemetryService | null = null
  private queue: TelemetryPayload[] = []
  private dispatchTimer: ReturnType<typeof setInterval> | null = null
  private endpointUrl: string = DEFAULT_TELEMETRY_ENDPOINT
  private isDispatching: boolean = false
  private isInitialized: boolean = false

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService()
    }
    return TelemetryService.instance
  }

  public static resetInstanceForTesting(): void {
    if (TelemetryService.instance) {
      TelemetryService.instance.stop()
      TelemetryService.instance = null
    }
  }

  public setEndpointUrl(url: string): void {
    this.endpointUrl = url
  }

  public init(): void {
    if (this.isInitialized) return
    this.isInitialized = true

    // Start recurring dispatch timer
    if (!this.dispatchTimer) {
      this.dispatchTimer = setInterval(() => {
        void this.dispatch()
      }, DISPATCH_INTERVAL_MS)
    }

    // Send startup heartbeat (minimal if disabled, full if enabled)
    void this.sendHeartbeat()
  }

  public stop(): void {
    if (this.dispatchTimer) {
      clearInterval(this.dispatchTimer)
      this.dispatchTimer = null
    }
    this.isInitialized = false
  }

  public getQueueLength(): number {
    return this.queue.length
  }

  private getBaseMetadata(): {
    distinctId: string
    appVersion: string
    osPlatform: string
    osRelease: string
    osArch: string
    isPortable: boolean
  } {
    const appVersion = app?.getVersion ? app.getVersion() : '1.3.0'
    const distinctId = getAnonymousDistinctId()
    const osPlatform = process.platform
    const osRelease = os.release ? os.release() : ''
    const osArch = process.arch
    const isPortable = isPortableMode()

    return {
      distinctId,
      appVersion,
      osPlatform,
      osRelease,
      osArch,
      isPortable
    }
  }

  /**
   * Tracks an event when telemetry is enabled.
   * If telemetry is disabled by the user, this call is a complete NO-OP.
   */
  public trackEvent(
    eventName: string,
    properties?: Record<string, string | number | boolean>
  ): void {
    if (!getTelemetryEnabled()) {
      return
    }

    if (!eventName || typeof eventName !== 'string') {
      return
    }

    const base = this.getBaseMetadata()
    const payload: FullTelemetryEventPayload = {
      ...base,
      telemetryMode: 'full',
      eventName: eventName.trim(),
      properties: sanitizeProperties(properties),
      timestamp: Date.now()
    }

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift() // Drop oldest item to prevent memory leaks
    }
    this.queue.push(payload)

    if (this.queue.length >= MAX_BATCH_SIZE) {
      void this.dispatch()
    }
  }

  /**
   * Sends heartbeat payload.
   * - If telemetryEnabled is false: sends MinimalPingPayload (minimal anonymous ping only: app version, OS, arch, portable mode).
   * - If telemetryEnabled is true: sends minimal ping with full telemetryMode or app_heartbeat event.
   */
  public async sendHeartbeat(): Promise<void> {
    const base = this.getBaseMetadata()
    const isEnabled = getTelemetryEnabled()

    if (!isEnabled) {
      const minimalPing: MinimalPingPayload = {
        ...base,
        telemetryMode: 'minimal',
        timestamp: Date.now()
      }
      await this.sendBatch([minimalPing])
    } else {
      this.trackEvent('app_heartbeat', {
        heartbeatTime: Date.now()
      })
      await this.dispatch()
    }
  }

  /**
   * Dispatches queued events to the telemetry endpoint.
   */
  public async dispatch(): Promise<void> {
    if (this.isDispatching || this.queue.length === 0) {
      return
    }

    this.isDispatching = true
    try {
      const batch = this.queue.splice(0, MAX_BATCH_SIZE)
      const success = await this.sendBatch(batch)
      if (!success) {
        // If send failed and queue has room, put items back at the head
        if (this.queue.length + batch.length <= MAX_QUEUE_SIZE) {
          this.queue.unshift(...batch)
        }
      }
    } finally {
      this.isDispatching = false
    }
  }

  /**
   * Flushes all queued items immediately (e.g. before app exit).
   */
  public async flush(timeoutMs: number = 2000): Promise<void> {
    if (this.queue.length === 0) return

    const flushPromise = async (): Promise<void> => {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, MAX_BATCH_SIZE)
        const success = await this.sendBatch(batch)
        if (!success) {
          break // If network is down, stop trying during exit
        }
      }
    }

    await Promise.race([
      flushPromise(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])
  }

  /**
   * Sends a batch of telemetry payloads over HTTP.
   * Non-blocking and never throws: errors are logged and swallowed safely.
   */
  private async sendBatch(items: TelemetryPayload[]): Promise<boolean> {
    if (!items || items.length === 0) return true

    const appVersion = app?.getVersion ? app.getVersion() : '1.3.0'
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const fetchFn = typeof net?.fetch === 'function' ? net.fetch.bind(net) : globalThis.fetch

      if (typeof fetchFn !== 'function') {
        return false
      }

      const response = await fetchFn(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `osu-beatmap-backup/${appVersion}`
        },
        body: JSON.stringify({
          batch: items,
          sentAt: Date.now()
        }),
        signal: controller.signal
      })

      return response.ok
    } catch (error) {
      // Intentionally silent in production to never disrupt app usage.
      // Detailed error only logged in debug/trace if needed.
      if (process.env.NODE_ENV === 'development') {
        logger.warn(
          `[TelemetryService] Dispatch failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      return false
    } finally {
      clearTimeout(timeout)
    }
  }
}

export default TelemetryService
