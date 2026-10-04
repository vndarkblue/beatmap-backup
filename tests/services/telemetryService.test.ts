import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  TelemetryService,
  sanitizePath,
  sanitizeProperties
} from '../../src/services/telemetryService'
import * as settingsStore from '../../src/services/settingsStore'

describe('TelemetryService & Data Sanitization', () => {
  describe('sanitizePath', () => {
    it('redacts Windows user folder from paths', () => {
      const input = 'C:\\Users\\JohnDoe\\AppData\\Local\\osu!\\Songs'
      const output = sanitizePath(input)
      expect(output).toBe('C:\\Users\\[REDACTED]\\AppData\\Local\\osu!\\Songs')
      expect(output).not.toContain('JohnDoe')
    })

    it('redacts macOS and Linux user folders', () => {
      expect(sanitizePath('/Users/alice/Library/Application Support/osu')).toBe(
        '/Users/[REDACTED]/Library/Application Support/osu'
      )
      expect(sanitizePath('/home/bob/.local/share/osu')).toBe('/home/[REDACTED]/.local/share/osu')
    })

    it('returns empty string for non-string input', () => {
      // @ts-expect-error test invalid inputs
      expect(sanitizePath(null)).toBe('')
      // @ts-expect-error test invalid inputs
      expect(sanitizePath(undefined)).toBe('')
    })
  })

  describe('sanitizeProperties', () => {
    it('sanitizes strings and preserves numbers and booleans', () => {
      const props = {
        path: 'C:\\Users\\Alice\\Documents\\test.bbak',
        count: 1234,
        success: true,
        nestedObject: { key: 'value' } // should be stripped out
      }

      const result = sanitizeProperties(props as Record<string, unknown>)
      expect(result.path).toBe('C:\\Users\\[REDACTED]\\Documents\\test.bbak')
      expect(result.count).toBe(1234)
      expect(result.success).toBe(true)
      expect(result.nestedObject).toBeUndefined()
    })

    it('truncates extremely long string values', () => {
      const longText = 'a'.repeat(600)
      const result = sanitizeProperties({ longText })
      expect((result.longText as string).length).toBe(503) // 500 chars + '...'
      expect((result.longText as string).endsWith('...')).toBe(true)
    })
  })

  describe('TelemetryService lifecycle & dispatching', () => {
    let service: TelemetryService

    beforeEach(() => {
      TelemetryService.resetInstanceForTesting()
      service = TelemetryService.getInstance()
      vi.restoreAllMocks()
    })

    afterEach(() => {
      service.stop()
      TelemetryService.resetInstanceForTesting()
      vi.restoreAllMocks()
    })

    it('queues events when telemetry is enabled', () => {
      vi.spyOn(settingsStore, 'getTelemetryEnabled').mockReturnValue(true)

      expect(service.getQueueLength()).toBe(0)
      service.trackEvent('backup_completed', {
        source: 'stable',
        count: 50
      })

      expect(service.getQueueLength()).toBe(1)
    })

    it('drops events and does NOT queue when telemetry is disabled', () => {
      vi.spyOn(settingsStore, 'getTelemetryEnabled').mockReturnValue(false)

      service.trackEvent('backup_completed', {
        source: 'stable'
      })
      service.trackEvent('download_batch_completed', {
        total: 100
      })

      expect(service.getQueueLength()).toBe(0)
    })

    it('sends minimal anonymous ping on heartbeat when telemetry is disabled', async () => {
      vi.spyOn(settingsStore, 'getTelemetryEnabled').mockReturnValue(false)

      let capturedPayload: unknown = null
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        capturedPayload = JSON.parse(options.body)
        return Promise.resolve({ ok: true, status: 200 })
      })
      vi.stubGlobal('fetch', mockFetch)

      await service.sendHeartbeat()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(capturedPayload).not.toBeNull()
      const body = capturedPayload as {
        batch: Array<{ telemetryMode: string; appVersion: string }>
      }
      expect(body.batch).toHaveLength(1)
      expect(body.batch[0].telemetryMode).toBe('minimal')
      expect(body.batch[0].appVersion).toBeDefined()
    })

    it('flushes queued events using batch HTTP requests', async () => {
      vi.spyOn(settingsStore, 'getTelemetryEnabled').mockReturnValue(true)

      const dispatchedBatches: unknown[] = []
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        dispatchedBatches.push(JSON.parse(options.body))
        return Promise.resolve({ ok: true, status: 200 })
      })
      vi.stubGlobal('fetch', mockFetch)

      service.trackEvent('event_1', { num: 1 })
      service.trackEvent('event_2', { num: 2 })

      expect(service.getQueueLength()).toBe(2)

      await service.flush(1000)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(service.getQueueLength()).toBe(0)
      expect(dispatchedBatches).toHaveLength(1)
    })

    it('handles network failure gracefully without throwing exceptions', async () => {
      vi.spyOn(settingsStore, 'getTelemetryEnabled').mockReturnValue(true)

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline / ECONNREFUSED'))
      vi.stubGlobal('fetch', mockFetch)

      service.trackEvent('event_fail', { status: 'offline' })

      // Should not throw
      await expect(service.dispatch()).resolves.not.toThrow()
    })
  })
})
