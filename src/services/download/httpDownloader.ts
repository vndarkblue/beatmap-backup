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
    let filePath: string | undefined
    let currentResponse: http.IncomingMessage | undefined

    const makeRequest = (targetUrl: URL, redirectCount = 0): void => {
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
              reject(new Error('Too many redirects'))
              return
            }
            try {
              const nextUrl = new URL(response.headers.location, targetUrl)
              req.destroy()
              makeRequest(nextUrl, redirectCount + 1)
              return
            } catch {
              reject(new Error('Invalid redirect URL'))
              return
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: ${response.statusCode}`))
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
          filePath = path.join(downloadPath, fileName)

          task.fileName = fileName
          onProgress(task)

          writer = fs.createWriteStream(filePath)
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

          response.on('error', (err) => reject(err))
          writer.on('error', (err) => reject(err))

          response.pipe(writer)

          writer.on('finish', () => {
            task.status = 'completed'
            task.progress = 100
            task.speed = 0
            task.remainingTime = 0
            task.filePath = filePath
            resolve({ startTime })
          })
        }
      )

      req.on('error', (error) => {
        currentResponse?.destroy()
        writer?.destroy()
        if (filePath) {
          fs.unlink(filePath, () => {})
        }
        reject(error)
      })

      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'))
      })

      req.end()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(task as any).request = req
    }

    makeRequest(startUrl)
  })
}
