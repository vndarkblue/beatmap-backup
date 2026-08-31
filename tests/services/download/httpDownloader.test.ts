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
  downloadFile
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

            const fakeRes = new Readable({
              read() {}
            }) as unknown as http.IncomingMessage
            fakeRes.statusCode = 200
            fakeRes.headers = {
              ...(ct ? { 'content-type': ct } : {}),
              'content-length': '4'
            }
            fakeRes.destroy = vi.fn()

            if (callback) {
              process.nextTick(() => {
                callback(fakeRes)
                process.nextTick(() => {
                  fakeRes.push(Buffer.from('PK\x03\x04'))
                  fakeRes.push(null)
                })
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
})
