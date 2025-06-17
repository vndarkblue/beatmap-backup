import { EventEmitter } from 'events'
// import { default as PQueue } from 'p-queue'
import path from 'path'
import fs from 'fs'
import https from 'https'
import { URL } from 'url'
import { BeatmapMirror } from '../config/beatmapMirrors'
import { DefaultBeatmapMirrors } from '../config/beatmapMirrors'
import { dialog } from 'electron'
import os from 'os'
import { execSync } from 'child_process'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PQueue = require('p-queue').default
console.log('PQueue in downloadService:', PQueue)
console.log('PQueue type:', typeof PQueue)
console.log('PQueue prototype:', PQueue.prototype)

// Types
export interface DownloadTask {
  id: string
  beatmapsetId: string
  mirror: BeatmapMirror
  noVideo: boolean
  status: 'waiting' | 'downloading' | 'completed' | 'error'
  progress: number
  speed: number
  remainingTime: number
  error?: string
  downloadPath?: string
  request?: ReturnType<typeof https.get>
}

export interface DownloadOptions {
  threadCount: number
  sources: string[]
  noVideo: boolean
  downloadPath?: string
}

// Events
export enum DownloadEvent {
  TASK_ADDED = 'taskAdded',
  TASK_UPDATED = 'taskUpdated',
  TASK_COMPLETED = 'taskCompleted',
  TASK_ERROR = 'taskError',
  QUEUE_PAUSED = 'queuePaused',
  QUEUE_RESUMED = 'queueResumed',
  QUEUE_CLEARED = 'queueCleared'
}

class DownloadService extends EventEmitter {
  private static instance: DownloadService
  private queue: typeof PQueue
  private tasks: Map<string, DownloadTask>
  private isPaused: boolean
  private currentMirrorIndex: number
  private cooldownPeriod: number
  private cooldownTimeout?: NodeJS.Timeout
  private mirrorHealth: Map<string, { success: number; failure: number; avgResponseTime: number }>

  private constructor() {
    super()
    this.queue = new PQueue({ concurrency: 1 })
    this.tasks = new Map()
    this.isPaused = false
    this.currentMirrorIndex = 0
    this.cooldownPeriod = 5000
    this.mirrorHealth = new Map()
  }

  public static getInstance(): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService()
    }
    return DownloadService.instance
  }

  private getDefaultDownloadPath(): string {
    const platform = process.platform
    const homeDir = os.homedir()

    switch (platform) {
      case 'win32':
        try {
          // Read registry to get Downloads folder location
          const command =
            'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v "{374DE290-123F-4565-9164-39C4925E467B}"'
          const output = execSync(command, { encoding: 'utf-8' })
          const match = output.match(/REG_EXPAND_SZ\s+(.+)$/)

          if (match) {
            // Expand environment variables in the path
            const expandedPath = match[1].replace(/%([^%]+)%/g, (_, n) => process.env[n] || '')
            return expandedPath
          }
        } catch (error) {
          console.error('Failed to read registry for Downloads folder:', error)
        }
        // Fallback to default Downloads folder
        return path.join(homeDir, 'Downloads')
      case 'darwin':
        // macOS: ~/Downloads
        return path.join(homeDir, 'Downloads')
      case 'linux':
        // Linux: ~/Downloads
        return path.join(homeDir, 'Downloads')
      default:
        // Fallback to current directory
        return process.cwd()
    }
  }

  private validateBackupFile(content: string): void {
    // Check if file has header
    if (!content.startsWith('# Beatmap Backup File')) {
      throw new Error('Invalid backup file format: Missing header')
    }

    // Check if file has required metadata
    const requiredMetadata = [
      '# Format: One beatmapset ID per line',
      '# Created:',
      '# Total beatmaps:',
      '# Source:'
    ]

    for (const metadata of requiredMetadata) {
      if (!content.includes(metadata)) {
        throw new Error(`Invalid backup file format: Missing ${metadata}`)
      }
    }

    // Get beatmapset IDs (skip header)
    const lines = content.split('\n')
    const ids = lines.filter((line) => line.trim() && !line.startsWith('#'))

    if (ids.length === 0) {
      throw new Error('Invalid backup file: No beatmapset IDs found')
    }

    // Validate each ID
    for (const id of ids) {
      if (!/^\d+$/.test(id.trim())) {
        throw new Error(`Invalid beatmapset ID: ${id}`)
      }
    }
  }

  private async validateDownloadPath(downloadPath: string): Promise<void> {
    try {
      // Check if path exists
      if (!fs.existsSync(downloadPath)) {
        throw new Error('Download path does not exist')
      }

      // Check if path is a directory
      const stats = await fs.promises.stat(downloadPath)
      if (!stats.isDirectory()) {
        throw new Error('Download path is not a directory')
      }

      // Check write permission
      try {
        await fs.promises.access(downloadPath, fs.constants.W_OK)
      } catch {
        throw new Error('No write permission in download path')
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Download path validation failed: ${error.message}`)
      }
      throw error
    }
  }

  public async startDownload(filePath: string, options: DownloadOptions): Promise<void> {
    try {
      // Read and validate backup file
      const content = await fs.promises.readFile(filePath, 'utf-8')
      this.validateBackupFile(content)
      const beatmapsetIds = content
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((id) => id.trim())

      // Update queue concurrency
      this.queue.concurrency = options.threadCount

      // Get available mirrors
      const availableMirrors = DefaultBeatmapMirrors.filter((mirror) =>
        options.sources.includes(mirror.name)
      )

      if (availableMirrors.length === 0) {
        throw new Error('No available mirrors selected')
      }

      // Use default download path if not specified
      const downloadPath = options.downloadPath || this.getDefaultDownloadPath()

      // Validate download path
      await this.validateDownloadPath(downloadPath)

      // Add tasks to queue
      for (const beatmapsetId of beatmapsetIds) {
        const task: DownloadTask = {
          id: `${beatmapsetId}-${Date.now()}`,
          beatmapsetId,
          mirror: availableMirrors[0],
          noVideo: options.noVideo,
          status: 'waiting',
          progress: 0,
          speed: 0,
          remainingTime: 0,
          downloadPath
        }

        this.tasks.set(task.id, task)
        this.emit(DownloadEvent.TASK_ADDED, task)

        this.queue.add(() => this.downloadTask(task, availableMirrors, options))
      }
    } catch (error) {
      console.error('Failed to start download:', error)
      throw error
    }
  }

  private async downloadTask(
    task: DownloadTask,
    availableMirrors: BeatmapMirror[],
    options: DownloadOptions
  ): Promise<void> {
    if (this.isPaused) {
      task.status = 'waiting'
      this.emit(DownloadEvent.TASK_UPDATED, task)
      return
    }

    task.status = 'downloading'
    this.emit(DownloadEvent.TASK_UPDATED, task)

    try {
      const downloadUrl = task.mirror.getDownloadUrl(task.beatmapsetId, task.noVideo)
      const downloadPath = options.downloadPath || path.join(process.cwd(), 'downloads')

      // Create download directory if it doesn't exist
      await fs.promises.mkdir(downloadPath, { recursive: true })

      // Start download
      await new Promise<void>((resolve, reject) => {
        const url = new URL(downloadUrl)
        let writer: fs.WriteStream
        let filePath: string

        const request = https.get(url, (response) => {
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
          filePath = path.join(downloadPath, fileName)

          // Create write stream
          writer = fs.createWriteStream(filePath)
          let downloadedBytes = 0
          const startTime = Date.now()
          let lastUpdate = startTime
          let lastBytes = 0

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length
            const currentTime = Date.now()
            const timeDiff = (currentTime - lastUpdate) / 1000 // seconds
            const bytesDiff = downloadedBytes - lastBytes

            if (timeDiff >= 1) {
              // Update every second
              task.speed = bytesDiff / timeDiff
              task.progress = totalSize ? Math.round((downloadedBytes / totalSize) * 100) : 0
              task.remainingTime = totalSize
                ? Math.round((totalSize - downloadedBytes) / task.speed)
                : 0
              this.emit(DownloadEvent.TASK_UPDATED, task)
              lastUpdate = currentTime
              lastBytes = downloadedBytes
            }
          })

          response.pipe(writer)

          writer.on('finish', () => {
            // Update mirror health on success
            const mirrorName = task.mirror.name
            const health = this.mirrorHealth.get(mirrorName) || {
              success: 0,
              failure: 0,
              avgResponseTime: 0
            }
            health.success++
            health.avgResponseTime =
              (health.avgResponseTime * (health.success - 1) + (Date.now() - startTime)) /
              health.success
            this.mirrorHealth.set(mirrorName, health)

            task.status = 'completed'
            task.progress = 100
            task.speed = 0
            task.remainingTime = 0
            task.downloadPath = filePath
            this.emit(DownloadEvent.TASK_COMPLETED, task)
            resolve()
          })
        })

        request.on('error', (error) => {
          writer.close()
          fs.unlink(filePath, () => {}) // Clean up partial file
          reject(error)
        })

        task.request = request
      })
    } catch (error) {
      console.error(`Download failed for ${task.beatmapsetId}:`, error)

      // Update mirror health on failure
      const mirrorName = task.mirror.name
      const health = this.mirrorHealth.get(mirrorName) || {
        success: 0,
        failure: 0,
        avgResponseTime: 0
      }
      health.failure++
      this.mirrorHealth.set(mirrorName, health)

      // If error is due to abort, don't try next mirror
      if (error instanceof Error && error.message === 'Download aborted') {
        task.status = 'waiting'
        task.error = 'Download cancelled'
        this.emit(DownloadEvent.TASK_UPDATED, task)
        return
      }

      // Try next mirror
      const currentIndex = availableMirrors.indexOf(task.mirror)
      const nextIndex = (currentIndex + 1) % availableMirrors.length

      if (nextIndex === 0) {
        // All mirrors failed, enter cooldown
        task.status = 'error'
        task.error = error instanceof Error ? error.message : 'Download failed'
        this.emit(DownloadEvent.TASK_ERROR, task)

        if (!this.cooldownTimeout) {
          this.cooldownTimeout = setTimeout(() => {
            this.cooldownTimeout = undefined
            // Retry failed tasks
            for (const [, task] of this.tasks) {
              if (task.status === 'error') {
                task.status = 'waiting'
                task.mirror = availableMirrors[0]
                this.emit(DownloadEvent.TASK_UPDATED, task)
                this.queue.add(() => this.downloadTask(task, availableMirrors, options))
              }
            }
          }, this.cooldownPeriod)
        }
      } else {
        // Try next mirror
        task.mirror = availableMirrors[nextIndex]
        task.status = 'waiting'
        this.emit(DownloadEvent.TASK_UPDATED, task)
        this.queue.add(() => this.downloadTask(task, availableMirrors, options))
      }
    }
  }

  public async pauseQueue(): Promise<void> {
    const activeDownloads = Array.from(this.tasks.values()).filter(
      (task) => task.status === 'downloading'
    )

    if (activeDownloads.length > 0) {
      const { response } = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Wait for completion', 'Cancel downloads', 'Cancel'],
        defaultId: 0,
        title: 'Pause Download Queue',
        message: 'How do you want to handle active downloads?',
        detail:
          'You can either wait for current downloads to complete or cancel them and add them back to the queue.'
      })

      if (response === 2) {
        // User clicked Cancel
        return
      }

      if (response === 1) {
        // Cancel active downloads
        for (const task of activeDownloads) {
          if (task.request) {
            task.request.destroy()
          }
        }
      }
    }

    this.isPaused = true
    this.emit(DownloadEvent.QUEUE_PAUSED)
  }

  public resumeQueue(): void {
    this.isPaused = false
    this.emit(DownloadEvent.QUEUE_RESUMED)
  }

  public clearQueue(): void {
    this.queue.clear()
    this.tasks.clear()
    this.emit(DownloadEvent.QUEUE_CLEARED)
  }

  public getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values())
  }

  public getQueueSize(): number {
    return this.queue.size
  }

  public getPendingSize(): number {
    return this.queue.pending
  }

  public getMirrorHealth(): Map<
    string,
    { success: number; failure: number; avgResponseTime: number }
  > {
    return this.mirrorHealth
  }
}

export default DownloadService
