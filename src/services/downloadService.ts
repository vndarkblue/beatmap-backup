import { EventEmitter } from 'events'
import { BeatmapMirror, DefaultBeatmapMirrors } from '../config/beatmapMirrors'
import { DownloadTask, DownloadOptions, DownloadEvent } from './download/types'
import {
  getDefaultDownloadPath,
  validateDownloadPath,
  validateBackupFile,
  getExistingBeatmapsetIds
} from './download/fileUtils'
import { downloadFile, MirrorHealth } from './download/httpDownloader'
import fs from 'fs'
import BeatmapMirrorService from './beatmapMirrorService'
import { QueuePersistence, type QueueSnapshot, QUEUE_SNAPSHOT_VERSION } from './download/queuePersistence'
import {
  getMaxCheckpointFileSizeMB,
  getQueueCheckpointIntervalMs
} from './settingsStore'

export type { DownloadTask, DownloadOptions }
export { DownloadEvent }

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PQueue = require('p-queue').default

class DownloadService extends EventEmitter {
  private static instance: DownloadService
  private queue: typeof PQueue
  private tasks: Map<string, DownloadTask>
  private isPaused: boolean
  private cooldownPeriod: number
  private cooldownTimeout?: NodeJS.Timeout
  private mirrorHealth: Map<string, MirrorHealth>
  private queueStartTime: number | null
  /** Stored so resumeQueue can re-add waiting tasks without needing closure args */
  private currentMirrors: BeatmapMirror[] = []
  private currentOptions: DownloadOptions | null = null
  private currentMirrorIndex = 0
  private currentRotationLimit = 20
  private mirrorCompletionCounts: Map<string, number> = new Map()
  private retryingTaskIds: Set<string> = new Set()
  private queueId: string | null = null
  private persistence: QueuePersistence
  private persistTimer?: NodeJS.Timeout
  private latestSnapshot: QueueSnapshot | null = null

  private constructor() {
    super()
    this.queue = new PQueue({ concurrency: 1 })
    this.tasks = new Map()
    this.isPaused = false
    this.cooldownPeriod = 5000
    this.mirrorHealth = new Map()
    this.queueStartTime = null
    this.persistence = new QueuePersistence()
  }

  public static getInstance(): DownloadService {
    if (!DownloadService.instance) {
      DownloadService.instance = new DownloadService()
    }
    return DownloadService.instance
  }

  private touchTask(task: DownloadTask): void {
    task.updatedAt = Date.now()
  }

  private buildSnapshot(): QueueSnapshot | null {
    // Persist only deterministic queue state; request handles are intentionally excluded.
    if (!this.queueId || !this.currentOptions) {
      return null
    }
    const snapshot: QueueSnapshot = {
      version: QUEUE_SNAPSHOT_VERSION,
      queueId: this.queueId,
      createdAt: this.queueStartTime ?? Date.now(),
      updatedAt: Date.now(),
      options: this.currentOptions,
      rotation: {
        currentMirrorIndex: this.currentMirrorIndex,
        currentRotationLimit: this.currentRotationLimit,
        mirrorCompletionCounts: Object.fromEntries(this.mirrorCompletionCounts.entries())
      },
      tasks: this.persistence.serializeTasks(this.getTasks())
    }
    return snapshot
  }

  private schedulePersistCheckpoint(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined
      void this.persistCheckpoint('debounced')
    }, getQueueCheckpointIntervalMs())
  }

  public async persistCheckpoint(reason: string): Promise<void> {
    const snapshot = this.buildSnapshot()
    if (!snapshot) {
      return
    }
    const payload = JSON.stringify(snapshot)
    const maxSizeBytes = Math.max(1, getMaxCheckpointFileSizeMB()) * 1024 * 1024
    if (Buffer.byteLength(payload, 'utf-8') > maxSizeBytes) {
      console.warn(`[QueuePersistence] Skip checkpoint(${reason}) due to size limit`)
      return
    }
    await this.persistence.saveSnapshot(snapshot)
    this.latestSnapshot = snapshot
    console.log(
      `[QueuePersistence] checkpoint(${reason}) tasks=${snapshot.tasks.length} queue=${snapshot.queueId}`
    )
  }

  public async flushCheckpointWithTimeout(timeoutMs = 2500): Promise<void> {
    await Promise.race([
      this.persistCheckpoint('shutdown'),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
    ])
  }

  public async preloadRecoveryState(): Promise<void> {
    this.latestSnapshot = await this.persistence.readSnapshot()
  }

  public getRecoveryState(): {
    canResume: boolean
    queueId: string | null
    taskCount: number
    waitingCount: number
    downloadingCount: number
    snapshotUpdatedAt: number | null
  } {
    const snapshot = this.latestSnapshot
    if (!snapshot) {
      return {
        canResume: false,
        queueId: null,
        taskCount: 0,
        waitingCount: 0,
        downloadingCount: 0,
        snapshotUpdatedAt: null
      }
    }
    const waitingCount = snapshot.tasks.filter((t) => t.status === 'waiting').length
    const downloadingCount = snapshot.tasks.filter((t) => t.status === 'downloading').length
    return {
      canResume: waitingCount + downloadingCount > 0,
      queueId: snapshot.queueId,
      taskCount: snapshot.tasks.length,
      waitingCount,
      downloadingCount,
      snapshotUpdatedAt: snapshot.updatedAt
    }
  }

  public async discardRecoveryState(): Promise<void> {
    this.latestSnapshot = null
    await this.persistence.clearSnapshot()
  }

  public async resumeRecoveredQueue(): Promise<boolean> {
    const snapshot = this.latestSnapshot ?? (await this.persistence.readSnapshot())
    if (!snapshot) return false
    this.latestSnapshot = snapshot
    await this.restorePersistedQueue(snapshot)
    return true
  }

  private async restorePersistedQueue(snapshot: QueueSnapshot): Promise<void> {
    // Rebuild queue from snapshot without replaying completed/error tasks.
    this.clearQueue(false)
    this.queueId = snapshot.queueId
    this.queueStartTime = snapshot.createdAt
    this.currentOptions = snapshot.options
    this.currentRotationLimit = snapshot.rotation.currentRotationLimit
    this.currentMirrorIndex = snapshot.rotation.currentMirrorIndex
    this.mirrorCompletionCounts = new Map(Object.entries(snapshot.rotation.mirrorCompletionCounts))

    const mirrorService = BeatmapMirrorService.getInstance()
    const healthyMirrorNames = await mirrorService.getHealthyMirrorNames()
    this.currentMirrors = DefaultBeatmapMirrors.filter(
      (mirror) =>
        snapshot.options.sources.includes(mirror.name) &&
        (!snapshot.options.noVideo || mirror.supportsNoVideo !== false) &&
        healthyMirrorNames.has(mirror.name)
    )
    if (this.currentMirrors.length === 0) {
      throw new Error('No healthy mirrors available to resume queue')
    }

    const tasks = this.persistence.deserializeTasks(snapshot.tasks)
    this.queue.concurrency = snapshot.options.threadCount
    for (const task of tasks) {
      task.queueId = snapshot.queueId
      if (task.status === 'downloading') {
        task.status = 'waiting'
      }
      this.touchTask(task)
      this.tasks.set(task.id, task)
      this.emit(DownloadEvent.TASK_ADDED, task)
      if (task.status === 'waiting') {
        this.queue.add(() => this.downloadTask(task, this.currentMirrors, snapshot.options))
      }
    }
    this.emit(DownloadEvent.QUEUE_RESUMED)
    this.schedulePersistCheckpoint()
  }

  public async startDownload(filePath: string, options: DownloadOptions): Promise<void> {
    try {
      this.clearQueue(false)
      this.queueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      this.queueStartTime = Date.now()

      const content = await fs.promises.readFile(filePath, 'utf-8')
      validateBackupFile(content)
      const beatmapsetIds = content
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#'))
        .map((id) => id.trim())

      let existingIds = new Set<number>()
      if (options.removeFromStable || options.removeFromLazer) {
        existingIds = await getExistingBeatmapsetIds(options)
      }

      const filteredIds = beatmapsetIds.filter((id) => {
        const numericId = parseInt(id)
        return !isNaN(numericId) && !existingIds.has(numericId)
      })

      if (filteredIds.length === 0) {
        return
      }

      this.queue.concurrency = options.threadCount

      const mirrorService = BeatmapMirrorService.getInstance()
      const healthyMirrorNames = await mirrorService.getHealthyMirrorNames()

      const selectedMirrors = DefaultBeatmapMirrors.filter((mirror) =>
        options.sources.includes(mirror.name)
      )
      const noVideoSupportedMirrors = options.noVideo
        ? selectedMirrors.filter((mirror) => mirror.supportsNoVideo !== false)
        : selectedMirrors
      const availableMirrors = noVideoSupportedMirrors.filter((mirror) =>
        healthyMirrorNames.has(mirror.name)
      )

      if (availableMirrors.length === 0) {
        if (options.noVideo && noVideoSupportedMirrors.length === 0) {
          throw new Error('No selected mirrors support no-video download')
        }
        throw new Error('No healthy mirrors available for the selected sources')
      }

      const dlPath = options.downloadPath || getDefaultDownloadPath()
      await validateDownloadPath(dlPath)

      this.currentMirrors = availableMirrors
      this.currentOptions = options
      this.currentMirrorIndex = 0
      this.currentRotationLimit = this.calculateRotationLimit(availableMirrors.length)
      this.mirrorCompletionCounts.clear()
      for (const mirror of availableMirrors) {
        this.mirrorCompletionCounts.set(mirror.name, 0)
      }
      console.log(
        `[MirrorRotation] healthy=${availableMirrors.length}, limitPerMirror=${this.currentRotationLimit}`
      )

      for (const beatmapsetId of filteredIds) {
        const initialMirror = this.getCurrentQueueMirror(availableMirrors)
        const task: DownloadTask = {
          id: `${beatmapsetId}-${Date.now()}`,
          queueId: this.queueId,
          beatmapsetId,
          mirror: initialMirror,
          noVideo: options.noVideo,
          status: 'waiting',
          progress: 0,
          speed: 0,
          remainingTime: 0,
          downloadPath: dlPath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          attemptCount: 0
        }

        this.tasks.set(task.id, task)
        this.emit(DownloadEvent.TASK_ADDED, task)
        this.schedulePersistCheckpoint()
        this.queue.add(() => this.downloadTask(task, availableMirrors, options))
      }
      await this.persistCheckpoint('queue-start')

      this.queue.onIdle().then(() => {
        this.checkQueueCompletion()
      })
    } catch (error) {
      console.error('Failed to start download:', error)
      throw error
    }
  }

  private checkQueueCompletion(): void {
    const hasActive = Array.from(this.tasks.values()).some(
      (t) => t.status !== 'completed' && t.status !== 'error'
    )
    if (hasActive || this.queue.size > 0 || this.queue.pending > 0) {
      return
    }

    const total = this.tasks.size
    const success = Array.from(this.tasks.values()).filter((t) => t.status === 'completed').length
    const failed = Array.from(this.tasks.values()).filter((t) => t.status === 'error').length
    const anyTask = this.tasks.values().next().value as DownloadTask | undefined
    const dlPath = anyTask?.downloadPath ?? null
    const durationMs = this.queueStartTime ? Date.now() - this.queueStartTime : 0

    this.emit(DownloadEvent.QUEUE_COMPLETED, {
      total,
      success,
      failed,
      downloadPath: dlPath,
      durationMs
    })

    void this.discardRecoveryState()
    setTimeout(() => this.clearQueue(), 2000)
  }

  private calculateRotationLimit(healthyCount: number): number {
    const raw = Math.round(120 / Math.max(healthyCount, 1))
    return Math.min(40, Math.max(10, raw))
  }

  private getCurrentQueueMirror(availableMirrors: BeatmapMirror[]): BeatmapMirror {
    if (availableMirrors.length === 0) {
      throw new Error('No mirrors available')
    }
    const safeIndex = this.currentMirrorIndex % availableMirrors.length
    return availableMirrors[safeIndex]
  }

  private recordMirrorCompletionAndRotate(
    availableMirrors: BeatmapMirror[],
    completedMirrorName: string
  ): void {
    const currentCount = this.mirrorCompletionCounts.get(completedMirrorName) ?? 0
    const nextCount = currentCount + 1
    this.mirrorCompletionCounts.set(completedMirrorName, nextCount)

    const currentMirror = this.getCurrentQueueMirror(availableMirrors)
    if (currentMirror.name === completedMirrorName && nextCount >= this.currentRotationLimit) {
      this.mirrorCompletionCounts.set(completedMirrorName, 0)
      this.currentMirrorIndex = (this.currentMirrorIndex + 1) % availableMirrors.length
      console.log(
        `[MirrorRotation] rotate to ${this.getCurrentQueueMirror(availableMirrors).name} after ${nextCount} completions on ${completedMirrorName}`
      )
    }
  }

  private async downloadTask(
    task: DownloadTask,
    availableMirrors: typeof DefaultBeatmapMirrors,
    options: DownloadOptions
  ): Promise<void> {
    if (this.isPaused) {
      task.status = 'waiting'
      this.touchTask(task)
      this.emit(DownloadEvent.TASK_UPDATED, task)
      this.schedulePersistCheckpoint()
      return
    }

    const hasMirrorRetryOverride = this.retryingTaskIds.has(task.id)
    if (!hasMirrorRetryOverride) {
      // Pick mirror from current queue rotation for first attempt.
      task.mirror = this.getCurrentQueueMirror(availableMirrors)
    } else {
      this.retryingTaskIds.delete(task.id)
    }
    task.attemptCount = (task.attemptCount ?? 0) + 1
    task.status = 'downloading'
    this.touchTask(task)
    this.emit(DownloadEvent.TASK_UPDATED, task)
    this.schedulePersistCheckpoint()

    const taskDownloadPath = task.downloadPath || options.downloadPath || getDefaultDownloadPath()

    try {
      const { startTime } = await downloadFile(task, taskDownloadPath, (updatedTask) => {
        this.emit(DownloadEvent.TASK_UPDATED, updatedTask)
      })

      // Update mirror health on success
      const mirrorName = task.mirror.name
      const health = this.mirrorHealth.get(mirrorName) || {
        success: 0,
        failure: 0,
        avgResponseTime: 0
      }
      health.success++
      health.avgResponseTime =
        (health.avgResponseTime * (health.success - 1) + (Date.now() - startTime)) / health.success
      this.mirrorHealth.set(mirrorName, health)
      task.error = undefined
      this.touchTask(task)
      this.recordMirrorCompletionAndRotate(availableMirrors, mirrorName)

      this.emit(DownloadEvent.TASK_COMPLETED, task)
      this.schedulePersistCheckpoint()
      this.checkQueueCompletion()
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

      if (error instanceof Error && error.message === 'Download aborted') {
        task.status = 'waiting'
        task.error = 'Download cancelled'
        task.lastErrorAt = Date.now()
        this.touchTask(task)
        this.emit(DownloadEvent.TASK_UPDATED, task)
        this.schedulePersistCheckpoint()
        // Race condition guard: if resumeQueue() ran before this abort settled,
        // re-add the task now since resumeQueue already iterated past it.
        if (!this.isPaused && this.currentMirrors.length && this.currentOptions) {
          this.queue.add(() => this.downloadTask(task, this.currentMirrors, this.currentOptions!))
        }
        return
      }

      const currentIndex = availableMirrors.indexOf(task.mirror)
      const nextIndex = (currentIndex + 1) % availableMirrors.length

      if (nextIndex === 0) {
        task.status = 'error'
        task.error = error instanceof Error ? error.message : 'Download failed'
        task.lastErrorAt = Date.now()
        this.touchTask(task)
        this.emit(DownloadEvent.TASK_ERROR, task)
        this.schedulePersistCheckpoint()

        if (!this.cooldownTimeout) {
          this.cooldownTimeout = setTimeout(() => {
            this.cooldownTimeout = undefined
            for (const [, t] of this.tasks) {
              if (t.status === 'error') {
                t.status = 'waiting'
                t.mirror = this.getCurrentQueueMirror(availableMirrors)
                this.retryingTaskIds.add(t.id)
                this.touchTask(t)
                this.emit(DownloadEvent.TASK_UPDATED, t)
                this.schedulePersistCheckpoint()
                this.queue.add(() => this.downloadTask(t, availableMirrors, options))
              }
            }
          }, this.cooldownPeriod)
        }

        if (this.queue.size === 0 && this.queue.pending === 0) {
          this.checkQueueCompletion()
        }
      } else {
        task.mirror = availableMirrors[nextIndex]
        this.retryingTaskIds.add(task.id)
        task.status = 'waiting'
        task.lastErrorAt = Date.now()
        this.touchTask(task)
        this.emit(DownloadEvent.TASK_UPDATED, task)
        this.schedulePersistCheckpoint()
        this.queue.add(() => this.downloadTask(task, availableMirrors, options))
      }
    }
  }

  public async pauseQueue(): Promise<void> {
    const { getWaitForDownloadsOnPause } = await import('./settingsStore')
    const shouldWaitForCompletion = getWaitForDownloadsOnPause()

    this.isPaused = true
    // Clear queued-but-not-started tasks from PQueue so they don't drain
    // through downloadTask (hitting the isPaused check and exiting) while paused.
    // They remain in this.tasks with status 'waiting' and will be re-added on resume.
    this.queue.clear()

    if (!shouldWaitForCompletion) {
      for (const task of this.tasks.values()) {
        if (task.status === 'downloading') {
          // Passing the error triggers the 'Download aborted' catch branch in downloadTask
          task.request?.destroy(new Error('Download aborted'))
        }
      }
    }

    this.emit(DownloadEvent.QUEUE_PAUSED)
    this.schedulePersistCheckpoint()
  }

  public resumeQueue(): void {
    this.isPaused = false

    if (this.currentMirrors.length && this.currentOptions) {
      for (const task of this.tasks.values()) {
        if (task.status === 'waiting') {
          this.queue.add(() => this.downloadTask(task, this.currentMirrors, this.currentOptions!))
        }
      }
    }

    this.emit(DownloadEvent.QUEUE_RESUMED)
    this.schedulePersistCheckpoint()
  }

  public clearQueue(emitEvent = true): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading') {
        task.request?.destroy(new Error('Download aborted'))
      }
    }
    this.queue.clear()
    this.tasks.clear()
    this.currentMirrors = []
    this.currentOptions = null
    this.queueId = null
    this.currentMirrorIndex = 0
    this.currentRotationLimit = 20
    this.mirrorCompletionCounts.clear()
    this.retryingTaskIds.clear()
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = undefined
    }
    if (emitEvent) {
      this.emit(DownloadEvent.QUEUE_CLEARED)
    }
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

  public getMirrorHealth(): Map<string, MirrorHealth> {
    return this.mirrorHealth
  }
}

export default DownloadService
