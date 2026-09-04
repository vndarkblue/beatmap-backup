import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import { URL } from 'url'
import { is } from '../../utils/env'
import type { DownloadTask } from './types'

export interface MirrorHealth {
  success: number
  failure: number
  avgResponseTime: number
}

export class DownloadHttpError extends Error {
  public readonly statusCode?: number
  public readonly retryAfterMs?: number

  constructor(message: string, statusCode?: number, retryAfterMs?: number) {
    super(message)
    this.name = 'DownloadHttpError'
    this.statusCode = statusCode
    this.retryAfterMs = retryAfterMs
  }
}

export function sanitizeFileName(name: string): string {
  const invalidChars = /[<>:\\"/|?*]/g
  let safe = name.replace(invalidChars, ' ').replace(/\s+/g, ' ').trim()
  // Disallow trailing periods or spaces on Windows
  safe = safe.replace(/[ .]+$/g, '')
  if (!/\.osz$/i.test(safe)) {
    safe = `${safe}.osz`
  }
  return safe
}

export function parseRetryAfterMs(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) {
    return undefined
  }
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }
  const dateMs = Date.parse(raw)
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now())
  }
  return undefined
}

export interface SpeedStats {
  speed: number
  progress: number
  remainingTime: number
}

export class SpeedTracker {
  private smoothedSpeed = 0
  private totalBytes = 0
  private lastTickBytes = 0
  private lastTickTime: number
  private readonly startTime: number
  private readonly alpha: number

  constructor(alpha = 0.3, startTime: number = Date.now()) {
    this.alpha = alpha
    this.startTime = startTime
    this.lastTickTime = startTime
  }

  recordBytes(byteCount: number): void {
    if (byteCount > 0) {
      this.totalBytes += byteCount
    }
  }

  getTotalBytes(): number {
    return this.totalBytes
  }

  getAverageSpeed(currentTime: number = Date.now()): number {
    const elapsedSeconds = (currentTime - this.startTime) / 1000
    if (elapsedSeconds <= 0) return 0
    return this.totalBytes / elapsedSeconds
  }

  tick(totalSize: number, currentTime: number = Date.now()): SpeedStats {
    const timeDiff = (currentTime - this.lastTickTime) / 1000
    if (timeDiff <= 0) {
      return {
        speed: Math.round(this.smoothedSpeed),
        progress:
          totalSize > 0 ? Math.min(100, Math.round((this.totalBytes / totalSize) * 100)) : 0,
        remainingTime:
          totalSize > 0 && this.smoothedSpeed > 0
            ? Math.max(0, Math.round((totalSize - this.totalBytes) / this.smoothedSpeed))
            : 0
      }
    }

    const bytesDiff = this.totalBytes - this.lastTickBytes
    const instantSpeed = bytesDiff / timeDiff

    if (this.smoothedSpeed === 0) {
      this.smoothedSpeed = instantSpeed
    } else {
      this.smoothedSpeed = this.alpha * instantSpeed + (1 - this.alpha) * this.smoothedSpeed
    }

    if (this.smoothedSpeed < 1) {
      this.smoothedSpeed = 0
    }

    this.lastTickTime = currentTime
    this.lastTickBytes = this.totalBytes

    const progress =
      totalSize > 0 ? Math.min(100, Math.round((this.totalBytes / totalSize) * 100)) : 0
    const remainingTime =
      totalSize > 0 && this.smoothedSpeed > 0
        ? Math.max(0, Math.round((totalSize - this.totalBytes) / this.smoothedSpeed))
        : 0

    return {
      speed: Math.round(this.smoothedSpeed),
      progress,
      remainingTime
    }
  }
}

export async function downloadFile(
  task: DownloadTask,
  downloadPath: string,
  onProgress: (task: DownloadTask) => void
): Promise<{ startTime: number }> {
  // If a drive root like "F:\\" is passed, use a safe subfolder
  const resolvedForCheck = path.resolve(downloadPath)
  if (resolvedForCheck === path.parse(resolvedForCheck).root) {
    downloadPath = path.join(downloadPath, 'osu-beatmaps')
  }

  // Create download directory if it doesn't exist (avoid creating drive root)
  const resolvedPath = path.resolve(downloadPath)
  const isRoot = resolvedPath === path.parse(resolvedPath).root
  if (!isRoot) {
    try {
      await fs.promises.mkdir(downloadPath, { recursive: true })
    } catch (e) {
      if (!(e instanceof Error) || (e as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw e
      }
    }
  }

  const downloadUrl = task.mirror.getDownloadUrl(task.beatmapsetId, task.noVideo)

  return new Promise<{ startTime: number }>((resolve, reject) => {
    const startUrl = new URL(downloadUrl)
    const startTime = Date.now()
    let writer: fs.WriteStream | undefined
    let finalFilePath: string | undefined
    let tempFilePath: string | undefined
    let currentResponse: http.IncomingMessage | undefined
    let requestSettled = false
    let tickInterval: NodeJS.Timeout | undefined

    const cleanupTimer = (): void => {
      if (tickInterval) {
        clearInterval(tickInterval)
        tickInterval = undefined
      }
    }

    const failWithCleanup = (error: Error): void => {
      cleanupTimer()
      if (requestSettled) return
      requestSettled = true
      currentResponse?.destroy()
      writer?.destroy()
      if (tempFilePath) {
        fs.unlink(tempFilePath, () => {})
      }
      reject(error)
    }

    const makeRequest = (targetUrl: URL, redirectCount = 0): void => {
      if (redirectCount === 0 && is.dev) {
        console.log(
          `[DownloadDebug] http.request set=${task.beatmapsetId} mirror=${task.mirror.name}` +
            ` url=${targetUrl.href}`
        )
      }
      const protocol = targetUrl.protocol === 'http:' ? http : https
      const req = protocol.request(
        targetUrl,
        {
          headers: {
            'User-Agent': 'osu-beatmap-backup/1.0 (+https://github.com)'
          }
        },
        (response) => {
          currentResponse = response
          // Handle redirects
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            response.headers.location
          ) {
            if (redirectCount >= 5) {
              if (is.dev) {
                console.log(
                  `[DownloadDebug] http.redirectOverflow set=${task.beatmapsetId} mirror=${task.mirror.name}` +
                    ` from=${targetUrl.href}`
                )
              }
              failWithCleanup(new Error('Too many redirects'))
              return
            }
            try {
              const nextUrl = new URL(response.headers.location, targetUrl)
              if (is.dev) {
                console.log(
                  `[DownloadDebug] http.redirect set=${task.beatmapsetId} mirror=${task.mirror.name}` +
                    ` ${response.statusCode} → ${nextUrl.href}`
                )
              }
              req.destroy()
              makeRequest(nextUrl, redirectCount + 1)
              return
            } catch {
              failWithCleanup(new Error('Invalid redirect URL'))
              return
            }
          }

          if (response.statusCode !== 200) {
            const isRateLimit = response.statusCode === 429
            if (is.dev) {
              console.log(
                `[DownloadDebug] http.non200 set=${task.beatmapsetId} mirror=${task.mirror.name}` +
                  ` status=${response.statusCode} rateLimit=${isRateLimit}` +
                  ` url=${targetUrl.href}` +
                  ` retry-after=${response.headers['retry-after'] ?? 'n/a'}`
              )
            }
            failWithCleanup(
              new DownloadHttpError(
                `Failed to download: ${response.statusCode}`,
                response.statusCode,
                parseRetryAfterMs(response.headers['retry-after'])
              )
            )
            return
          }

          const rawContentType = response.headers['content-type'] ?? ''
          const contentType = Array.isArray(rawContentType)
            ? rawContentType.join(' ')
            : rawContentType
          if (/text\/html/i.test(contentType)) {
            failWithCleanup(
              new DownloadHttpError('Mirror returned HTML error page instead of .osz file', 200)
            )
            return
          }

          const totalSize = parseInt(response.headers['content-length'] || '0', 10)

          // Get filename from Content-Disposition header or fallback to beatmapsetId
          let fileName = `${task.beatmapsetId}.osz`
          const contentDisposition = response.headers['content-disposition']
          if (contentDisposition) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition)
            if (matches && matches[1]) {
              fileName = matches[1].replace(/['"]/g, '')
            }
          }
          fileName = sanitizeFileName(fileName)
          finalFilePath = path.join(downloadPath, fileName)
          tempFilePath = `${finalFilePath}.part`

          task.fileName = fileName
          onProgress(task)

          writer = fs.createWriteStream(tempFilePath)
          const tracker = new SpeedTracker(0.3, startTime)

          tickInterval = setInterval(() => {
            const stats = tracker.tick(totalSize)
            task.speed = stats.speed
            task.progress = stats.progress
            task.remainingTime = stats.remainingTime
            onProgress(task)
          }, 500)
          tickInterval.unref?.()

          response.on('data', (chunk) => {
            tracker.recordBytes(chunk.length)
          })

          response.on('error', (err) => failWithCleanup(err))
          writer.on('error', (err) => failWithCleanup(err))

          response.pipe(writer)

          writer.on('finish', () => {
            cleanupTimer()
            const downloadedBytes = tracker.getTotalBytes()
            if (!finalFilePath || !tempFilePath) {
              failWithCleanup(new Error('Download finalize failed: missing target path'))
              return
            }
            if (totalSize > 0 && downloadedBytes !== totalSize) {
              failWithCleanup(
                new Error(
                  `Download incomplete: expected ${totalSize} bytes but received ${downloadedBytes} bytes`
                )
              )
              return
            }
            fs.rename(tempFilePath, finalFilePath, (renameError) => {
              if (renameError) {
                failWithCleanup(renameError)
                return
              }
              if (requestSettled) return
              requestSettled = true
              task.status = 'completed'
              task.progress = 100
              task.speed = 0
              task.remainingTime = 0
              task.filePath = finalFilePath
              resolve({ startTime })
            })
          })
        }
      )

      req.on('error', (error) => {
        if (is.dev) {
          console.log(
            `[DownloadDebug] http.reqError set=${task.beatmapsetId} mirror=${task.mirror.name}` +
              ` error=${error.message}`
          )
        }
        failWithCleanup(error)
      })

      req.setTimeout(30000, () => {
        if (is.dev) {
          console.log(
            `[DownloadDebug] http.timeout set=${task.beatmapsetId} mirror=${task.mirror.name}` +
              ` url=${targetUrl.href}`
          )
        }
        req.destroy(new Error('Request timeout'))
      })

      req.end()
      task.request = req
    }

    makeRequest(startUrl)
  })
}
