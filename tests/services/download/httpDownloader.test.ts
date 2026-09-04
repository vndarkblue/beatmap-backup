import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'http'
import https from 'https'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  sanitizeFileName,
  parseRetryAfterMs,
  DownloadHttpError,
  downloadFile,
  SpeedTracker
} from '../../../src/services/download/httpDownloader'
import { DefaultBeatmapMirrors } from '../../../src/config/beatmapMirrors'
import type { DownloadTask } from '../../../src/services/download/types'

describe('httpDownloader', () => {
  describe('sanitizeFileName', () => {
    it('replaces invalid filesystem characters with spaces', () => {
      const sanitized = sanitizeFileName('Artist: Title <Version> "Extra"? *Cool* | Hard.osz')
      expect(sanitized).not.toMatch(/[<>:"/\\|?*]/)
      expect(sanitized).toContain('.osz')
    })

    it('appends .osz extension if missing', () => {
      expect(sanitizeFileName('Beatmap')).toBe('Beatmap.osz')
      expect(sanitizeFileName('Beatmap.osz')).toBe('Beatmap.osz')
      expect(sanitizeFileName('Beatmap.OSZ')).toBe('Beatmap.OSZ')
    })

    it('strips trailing dots and spaces before appending .osz', () => {
      expect(sanitizeFileName('Beatmap.  ')).toBe('Beatmap.osz')
      expect(sanitizeFileName('Beatmap...')).toBe('Beatmap.osz')
    })
  })

  describe('parseRetryAfterMs', () => {
    it('parses numeric seconds into milliseconds', () => {
      expect(parseRetryAfterMs('30')).toBe(30000)
      expect(parseRetryAfterMs('0')).toBe(0)
    })

    it('parses HTTP date string into millisecond offset from now', () => {
      const futureDate = new Date(Date.now() + 10000).toUTCString()
      const parsed = parseRetryAfterMs(futureDate)
      expect(parsed).toBeDefined()
      expect(parsed!).toBeGreaterThanOrEqual(8000)
      expect(parsed!).toBeLessThanOrEqual(12000)
    })

    it('handles array values by reading first element', () => {
      expect(parseRetryAfterMs(['60', '120'])).toBe(60000)
    })

    it('returns undefined for invalid or missing inputs', () => {
      expect(parseRetryAfterMs(undefined)).toBeUndefined()
      expect(parseRetryAfterMs('')).toBeUndefined()
      expect(parseRetryAfterMs('invalid-date')).toBeUndefined()
    })
  })

  describe('DownloadHttpError', () => {
    it('constructs with status code and retryAfterMs', () => {
      const err = new DownloadHttpError('Rate limited', 429, 5000)
      expect(err.name).toBe('DownloadHttpError')
      expect(err.message).toBe('Rate limited')
      expect(err.statusCode).toBe(429)
      expect(err.retryAfterMs).toBe(5000)
    })
  })

  describe('downloadFile & Content-Type Guard (F4)', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'http-downloader-test-'))
      vi.restoreAllMocks()
    })

    afterEach(async () => {
      vi.restoreAllMocks()
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    })

    it('fails download and cleans up when mirror returns 200 with text/html content-type', async () => {
      const task: DownloadTask = {
        id: 't-html',
        beatmapsetId: '12345',
        title: 'HTML error song',
        artist: 'Artist',
        creator: 'Creator',
        status: 'downloading',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0]
      }

      // Mock https.request to return 200 with text/html
      vi.spyOn(https, 'request').mockImplementation(
        (_url: unknown, _options: unknown, callback?: (res: http.IncomingMessage) => void) => {
          const fakeReq = new EventEmitter() as unknown as http.ClientRequest
          fakeReq.end = vi.fn().mockReturnThis()
          fakeReq.setTimeout = vi.fn().mockReturnThis()
          fakeReq.destroy = vi.fn()

          const fakeRes = new EventEmitter() as unknown as http.IncomingMessage
          fakeRes.statusCode = 200
          fakeRes.headers = {
            'content-type': 'text/html; charset=utf-8',
            'content-length': '1024'
          }
          fakeRes.destroy = vi.fn()
          fakeRes.pipe = vi.fn()

          if (callback) {
            process.nextTick(() => callback(fakeRes))
          }

          return fakeReq
        }
      )

      await expect(downloadFile(task, tempDir, () => {})).rejects.toThrow(
        /Mirror returned HTML error page instead of \.osz file/
      )
    })

    it('allows valid archive content types (application/octet-stream, zip, missing header)', async () => {
      const validTypes = [
        'application/octet-stream',
        'application/x-osu-beatmap-archive',
        'application/zip',
        undefined
      ]

      for (const ct of validTypes) {
        const task: DownloadTask = {
          id: `t-valid-${ct ?? 'none'}`,
          beatmapsetId: '12345',
          title: 'Valid Song',
          artist: 'Artist',
          creator: 'Creator',
          status: 'downloading',
          progress: 0,
          speed: 0,
          remainingTime: 0,
          noVideo: false,
          mirror: DefaultBeatmapMirrors[0]
        }

        vi.spyOn(https, 'request').mockImplementation(
          (_url: unknown, _options: unknown, callback?: (res: http.IncomingMessage) => void) => {
            const fakeReq = new EventEmitter() as unknown as http.ClientRequest
            fakeReq.end = vi.fn().mockReturnThis()
            fakeReq.setTimeout = vi.fn().mockReturnThis()
            fakeReq.destroy = vi.fn()

            const fakeRes = Readable.from([
              Buffer.from('PK\x03\x04')
            ]) as unknown as http.IncomingMessage
            fakeRes.statusCode = 200
            fakeRes.headers = {
              ...(ct ? { 'content-type': ct } : {}),
              'content-length': '4'
            }
            fakeRes.destroy = vi.fn()

            if (callback) {
              process.nextTick(() => {
                callback(fakeRes)
              })
            }

            return fakeReq
          }
        )

        await downloadFile(task, tempDir, () => {})
        expect(task.filePath).toBeDefined()
        expect(task.filePath).toContain('.osz')
        expect(fs.existsSync(task.filePath!)).toBe(true)
      }
    })
  })

  describe('SpeedTracker', () => {
    it('applies EMA smoothing across multiple ticks', () => {
      const tracker = new SpeedTracker(0.3, 1000)

      // First tick: 500,000 bytes in 0.5s -> instant = 1,000,000 B/s
      tracker.recordBytes(500000)
      const tick1 = tracker.tick(5000000, 1500)
      expect(tick1.speed).toBe(1000000)
      expect(tick1.progress).toBe(10)

      // Second tick: 250,000 bytes in 0.5s -> instant = 500,000 B/s
      // smoothed = 0.3 * 500,000 + 0.7 * 1,000,000 = 150,000 + 700,000 = 850,000 B/s
      tracker.recordBytes(250000)
      const tick2 = tracker.tick(5000000, 2000)
      expect(tick2.speed).toBe(850000)
      expect(tick2.progress).toBe(15)
    })

    it('gradually decays speed toward 0 on stall without bytes', () => {
      const tracker = new SpeedTracker(0.3, 1000)

      // Initial speed established
      tracker.recordBytes(1000000)
      const tick1 = tracker.tick(10000000, 2000)
      expect(tick1.speed).toBe(1000000)

      // Stall 1: 0 bytes over 1 second -> instant = 0
      // smoothed = 0.3 * 0 + 0.7 * 1,000,000 = 700,000
      const tick2 = tracker.tick(10000000, 3000)
      expect(tick2.speed).toBe(700000)

      // Stall 2: 0 bytes over 1 second -> 0.7 * 700,000 = 490,000
      const tick3 = tracker.tick(10000000, 4000)
      expect(tick3.speed).toBe(490000)

      // Many ticks without bytes -> eventually snaps to 0
      let lastTick = tick3
      for (let i = 5; i <= 50; i++) {
        lastTick = tracker.tick(10000000, 1000 + i * 1000)
      }
      expect(lastTick.speed).toBe(0)
    })

    it('computes accurate overall average speed fallback', () => {
      const tracker = new SpeedTracker(0.3, 1000)
      tracker.recordBytes(2000000)

      expect(tracker.getTotalBytes()).toBe(2000000)
      expect(tracker.getAverageSpeed(3000)).toBe(1000000) // 2MB in 2s
      expect(tracker.getAverageSpeed(1000)).toBe(0) // 0s elapsed
    })

    it('handles zero or missing totalSize for progress and ETA', () => {
      const tracker = new SpeedTracker(0.3, 1000)
      tracker.recordBytes(100000)

      const statsNoTotal = tracker.tick(0, 2000)
      expect(statsNoTotal.progress).toBe(0)
      expect(statsNoTotal.remainingTime).toBe(0)

      const statsWithTotal = tracker.tick(500000, 2000)
      expect(statsWithTotal.progress).toBe(20)
      // Remaining bytes: 400,000, speed: 100,000 B/s -> remainingTime: 4s
      expect(statsWithTotal.remainingTime).toBe(4)
    })

    it('handles zero time difference gracefully', () => {
      const tracker = new SpeedTracker(0.3, 1000)
      tracker.recordBytes(100000)
      const tick1 = tracker.tick(1000000, 2000)
      // Call immediately at same timestamp
      const tickSame = tracker.tick(1000000, 2000)
      expect(tickSame.speed).toBe(tick1.speed)
      expect(tickSame.progress).toBe(tick1.progress)
    })
  })
})
