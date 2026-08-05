import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import { URL } from 'url'
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

function sanitizeFileName(name: string): string {
  const invalidChars = /[<>:\\"/|?*]/g
  let safe = name.replace(invalidChars, ' ').replace(/\s+/g, ' ').trim()
  // Disallow trailing periods or spaces on Windows
  safe = safe.replace(/[ .]+$/g, '')
  if (!/\.osz$/i.test(safe)) {
    safe = `${safe}.osz`
  }
  return safe
}

function parseRetryAfterMs(value: string | string[] | undefined): number | undefined {
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

    const failWithCleanup = (error: Error): void => {
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
      if (redirectCount === 0) {
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
              console.log(
                `[DownloadDebug] http.redirectOverflow set=${task.beatmapsetId} mirror=${task.mirror.name}` +
                  ` from=${targetUrl.href}`
              )
              failWithCleanup(new Error('Too many redirects'))
              return
            }
            try {
              const nextUrl = new URL(response.headers.location, targetUrl)
              console.log(
                `[DownloadDebug] http.redirect set=${task.beatmapsetId} mirror=${task.mirror.name}` +
                  ` ${response.statusCode} → ${nextUrl.href}`
              )
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
            console.log(
              `[DownloadDebug] http.non200 set=${task.beatmapsetId} mirror=${task.mirror.name}` +
                ` status=${response.statusCode} rateLimit=${isRateLimit}` +
                ` url=${targetUrl.href}` +
                ` retry-after=${response.headers['retry-after'] ?? 'n/a'}`
            )
            failWithCleanup(
              new DownloadHttpError(
                `Failed to download: ${response.statusCode}`,
                response.statusCode,
                parseRetryAfterMs(response.headers['retry-after'])
              )
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
          let downloadedBytes = 0
          let lastUpdate = startTime
          let lastBytes = 0

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length
            const currentTime = Date.now()
            const timeDiff = (currentTime - lastUpdate) / 1000
            const bytesDiff = downloadedBytes - lastBytes

            if (timeDiff >= 1) {
              task.speed = bytesDiff / timeDiff
              task.progress = totalSize ? Math.round((downloadedBytes / totalSize) * 100) : 0
              task.remainingTime = totalSize
                ? Math.round((totalSize - downloadedBytes) / task.speed)
                : 0
              onProgress(task)
              lastUpdate = currentTime
              lastBytes = downloadedBytes
            }
          })

          response.on('error', (err) => failWithCleanup(err))
          writer.on('error', (err) => failWithCleanup(err))

          response.pipe(writer)

          writer.on('finish', () => {
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
        console.log(
          `[DownloadDebug] http.reqError set=${task.beatmapsetId} mirror=${task.mirror.name}` +
            ` error=${error.message}`
        )
        failWithCleanup(error)
      })

      req.setTimeout(30000, () => {
        console.log(
          `[DownloadDebug] http.timeout set=${task.beatmapsetId} mirror=${task.mirror.name}` +
            ` url=${targetUrl.href}`
        )
        req.destroy(new Error('Request timeout'))
      })

      req.end()
      task.request = req
    }

    makeRequest(startUrl)
  })
}
