import { EventEmitter } from 'events'
import { BeatmapMirror, DefaultBeatmapMirrors } from '../config/beatmapMirrors'
import { DownloadTask, DownloadOptions, DownloadEvent } from './download/types'
import {
  getDefaultDownloadPath,
  validateDownloadPath,
  validateBackupFile,
  getExistingBeatmapsetIds
} from './download/fileUtils'
import { downloadFile, DownloadHttpError, MirrorHealth } from './download/httpDownloader'
import fs from 'fs'
import path from 'path'
import BeatmapMirrorService from './beatmapMirrorService'
import {
  QueuePersistence,
  type QueueSnapshot,
  QUEUE_SNAPSHOT_VERSION
} from './download/queuePersistence'
import {
  getMaxCheckpointFileSizeMB,
  getQueueCheckpointIntervalMs,
  getWaitForDownloadsOnPause
} from './settingsStore'
import { is } from '../utils/env'

export type { DownloadTask, DownloadOptions }
export { DownloadEvent }

type MirrorRuntimeState = {
  mirror: BeatmapMirror
  activeDownloads: number
  maxConcurrency: number
  cooldownUntil: number
  rateLimitCount: number
  consecutiveFailures: number
  consecutiveSuccesses: number
}

type FailureKind = 'rate-limit' | 'not-found' | 'transient' | 'permanent' | 'cancelled'

const BASE_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000
const BASE_RATE_LIMIT_COOLDOWN_MS = 5000
const MAX_RATE_LIMIT_COOLDOWN_MS = 60000
const BASE_MIRROR_COOLDOWN_MS = 2000
const MAX_MIRROR_COOLDOWN_MS = 60000
const MIRROR_HEALTH_REFRESH_INTERVAL_MS = 30000

class DownloadService extends EventEmitter {
  private static instance: DownloadService
  private tasks: Map<string, DownloadTask>
  private isPaused: boolean
  private mirrorHealth: Map<string, MirrorHealth>
  private mirrorStates: Map<string, MirrorRuntimeState> = new Map()
  private activeDownloads = 0
  private schedulerTimer?: NodeJS.Timeout
  private queueStartTime: number | null
  private currentMirrors: BeatmapMirror[] = []
  private currentOptions: DownloadOptions | null = null
  private queueId: string | null = null
  private persistence: QueuePersistence
  private persistTimer?: NodeJS.Timeout
  private latestSnapshot: QueueSnapshot | null = null
  private mirrorUsageLogQueueId: string | null = null
  private mirrorHealthRefreshAt = 0
  private mirrorHealthRefreshInFlight?: Promise<void>

  private constructor() {
    super()
    this.tasks = new Map()
    this.isPaused = false
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

  private debugQueueState(label: string, extra?: Record<string, unknown>): void {
    if (!is.dev) return
    const counts = { waiting: 0, downloading: 0, completed: 0, error: 0 }
    for (const t of this.tasks.values()) {
      counts[t.status]++
    }
    const mirrors = Array.from(this.mirrorStates.values()).map((state) => ({
      name: state.mirror.name,
      active: state.activeDownloads,
      max: state.maxConcurrency,
      cooldownMs: Math.max(0, state.cooldownUntil - Date.now()),
      rateLimits: state.rateLimitCount
    }))
    const payload = {
      ...extra,
      queueId: this.queueId,
      isPaused: this.isPaused,
      global: {
        active: this.activeDownloads,
        cap: this.getGlobalConcurrencyLimit(),
        nextWakeupMs: this.getNextWakeupMs()
      },
      statusCounts: counts,
      mirrors
    }
    console.log(`[DownloadDebug] ${label}`, payload)
  }

  private buildSnapshot(): QueueSnapshot | null {
    if (!this.queueId || !this.currentOptions) {
      return null
    }
    return {
      version: QUEUE_SNAPSHOT_VERSION,
      queueId: this.queueId,
      createdAt: this.queueStartTime ?? Date.now(),
      updatedAt: Date.now(),
      options: this.currentOptions,
      scheduler: {
        mirrors: Array.from(this.mirrorStates.values()).map((state) => ({
          name: state.mirror.name,
          cooldownUntil: state.cooldownUntil,
          rateLimitCount: state.rateLimitCount,
          consecutiveFailures: state.consecutiveFailures,
          consecutiveSuccesses: state.consecutiveSuccesses
        }))
      },
      tasks: this.persistence.serializeTasks(this.getTasks())
    }
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
    if (is.dev) {
      console.log(
        `[QueuePersistence] checkpoint(${reason}) tasks=${snapshot.tasks.length} queue=${snapshot.queueId}`
      )
    }
  }

  public async flushCheckpointWithTimeout(timeoutMs = 2500): Promise<void> {
    let timedOut = false
    let timerHandle: NodeJS.Timeout | undefined
    const timer = new Promise<void>((resolve) => {
      timerHandle = setTimeout(() => {
        timedOut = true
        resolve()
      }, timeoutMs)
    })

    try {
      await Promise.race([this.persistCheckpoint('shutdown'), timer])
    } finally {
      if (timerHandle) {
        clearTimeout(timerHandle)
      }
    }

    if (timedOut) {
      const pending = Array.from(this.tasks.values()).filter((t) => t.status !== 'completed').length
      console.warn(
        `[QueuePersistence] flush checkpoint timed out after ${timeoutMs}ms, ${pending} task(s) may not be saved`
      )
    }
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
    const hasActiveInMemoryQueue =
      this.queueId !== null ||
      Array.from(this.tasks.values()).some(
        (t) => t.status === 'waiting' || t.status === 'downloading'
      )
    if (hasActiveInMemoryQueue) {
      return {
        canResume: false,
        queueId: null,
        taskCount: 0,
        waitingCount: 0,
        downloadingCount: 0,
        snapshotUpdatedAt: null
      }
    }

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

  public getQueueRuntimeState(): {
    hasQueue: boolean
    isPaused: boolean
    taskCount: number
    waitingCount: number
    downloadingCount: number
  } {
    const tasks = Array.from(this.tasks.values())
    const waitingCount = tasks.filter((t) => t.status === 'waiting').length
    const downloadingCount = tasks.filter((t) => t.status === 'downloading').length
    return {
      hasQueue: tasks.length > 0,
      isPaused: this.isPaused,
      taskCount: tasks.length,
      waitingCount,
      downloadingCount
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
    this.clearQueue(false)
    this.mirrorUsageLogQueueId = null
    this.queueId = snapshot.queueId
    this.queueStartTime = snapshot.createdAt
    this.currentOptions = snapshot.options

    const mirrorService = BeatmapMirrorService.getInstance()
    const healthyMirrorNames = await mirrorService.getHealthyMirrorNames()
    this.currentMirrors = DefaultBeatmapMirrors.filter(
      (mirror) =>
        snapshot.options.sources.includes(mirror.name) &&
        (!snapshot.options.noVideo || mirror.supportsNoVideo !== false) &&
        healthyMirrorNames.has(mirror.name)
    )
    console.log(
      `[DownloadDebug] restorePersistedQueue healthy=[${[...healthyMirrorNames].join(', ')}]` +
        ` available=[${this.currentMirrors.map((m) => m.name).join(', ')}]` +
        ` snapshotTasks=${snapshot.tasks.length}`
    )
    if (this.currentMirrors.length === 0) {
      throw new Error('No healthy mirrors available to resume queue')
    }

    this.initializeMirrorStates(this.currentMirrors, snapshot.options, snapshot)

    const tasks = this.persistence.deserializeTasks(snapshot.tasks)
    for (const task of tasks) {
      task.queueId = snapshot.queueId
      if (task.status === 'downloading') {
        task.status = 'waiting'
      }
      task.assignedMirror = undefined
      task.request = undefined
      this.touchTask(task)
      this.tasks.set(task.id, task)
      this.emit(DownloadEvent.TASK_ADDED, task)
    }
    this.debugQueueState('restorePersistedQueue.loaded')
    this.emit(DownloadEvent.QUEUE_RESUMED)
    this.schedulePersistCheckpoint()
    this.scheduleDownloads()
  }

  public async startDownload(filePath: string, options: DownloadOptions): Promise<void> {
    try {
      this.clearQueue(false)
      this.mirrorUsageLogQueueId = null
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
        throw new Error('All beatmaps in the backup file already exist on your system')
      }

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

      if (is.dev) {
        console.log(
          `[DownloadDebug] startDownload sources=${JSON.stringify(options.sources)}` +
            ` noVideo=${options.noVideo} threadCount=${options.threadCount}` +
            ` ids=${beatmapsetIds.length} filtered=${filteredIds.length}` +
            ` selected=[${selectedMirrors.map((m) => m.name).join(', ')}]` +
            ` healthy=[${[...healthyMirrorNames].join(', ')}]` +
            ` available=[${availableMirrors.map((m) => m.name).join(', ')}]`
        )
      }

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
      this.initializeMirrorStates(availableMirrors, options)

      const now = Date.now()
      for (const beatmapsetId of filteredIds) {
        const task: DownloadTask = {
          id: `${beatmapsetId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
          queueId: this.queueId,
          beatmapsetId,
          mirror: availableMirrors[0],
          noVideo: options.noVideo,
          status: 'waiting',
          progress: 0,
          speed: 0,
          remainingTime: 0,
          downloadPath: dlPath,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          mirrorAttemptCount: 0,
          attemptCount: 0,
          triedMirrors: []
        }

        this.tasks.set(task.id, task)
        this.emit(DownloadEvent.TASK_ADDED, task)
      }
      this.debugQueueState('startDownload.loaded', { taskCount: filteredIds.length })
      await this.persistCheckpoint('queue-start')
      this.scheduleDownloads()
    } catch (error) {
      console.error('Failed to start download:', error)
      throw error
    }
  }

  private initializeMirrorStates(
    mirrors: BeatmapMirror[],
    options: DownloadOptions,
    snapshot?: QueueSnapshot
  ): void {
    this.mirrorStates.clear()
    const perMirrorConcurrency = Math.max(
      1,
      Math.ceil(this.getGlobalConcurrencyLimit(options) / mirrors.length)
    )
    const persistedStates = new Map(
      snapshot?.scheduler?.mirrors.map((state) => [state.name, state])
    )

    for (const mirror of mirrors) {
      const persisted = persistedStates.get(mirror.name)
      this.mirrorStates.set(mirror.name, {
        mirror,
        activeDownloads: 0,
        maxConcurrency: perMirrorConcurrency,
        cooldownUntil: persisted?.cooldownUntil ?? 0,
        rateLimitCount: persisted?.rateLimitCount ?? 0,
        consecutiveFailures: persisted?.consecutiveFailures ?? 0,
        consecutiveSuccesses: persisted?.consecutiveSuccesses ?? 0
      })
    }
  }

  private getGlobalConcurrencyLimit(options = this.currentOptions): number {
    return Math.max(1, options?.threadCount ?? 1)
  }

  private scheduleDownloads(): void {
    this.clearSchedulerTimer()
    if (this.isPaused || !this.currentOptions || this.currentMirrors.length === 0) {
      return
    }

    this.refreshMirrorAvailability()

    let dispatched = 0
    while (this.activeDownloads < this.getGlobalConcurrencyLimit()) {
      const next = this.pickNextRunnableTask()
      if (!next) {
        break
      }
      dispatched++
      this.startTask(next.task, next.mirror)
    }

    if (dispatched > 0) {
      this.debugQueueState('scheduler.dispatched', { dispatched })
    }

    this.scheduleNextWakeup()
    this.checkQueueCompletion()
  }

  private refreshMirrorAvailability(): void {
    const now = Date.now()
    if (
      !this.currentOptions ||
      this.mirrorHealthRefreshInFlight ||
      this.mirrorHealthRefreshAt > now
    ) {
      return
    }

    this.mirrorHealthRefreshAt = now + MIRROR_HEALTH_REFRESH_INTERVAL_MS
    const refreshQueueId = this.queueId
    const mirrorService = BeatmapMirrorService.getInstance()
    this.mirrorHealthRefreshInFlight = (async () => {
      const healthyMirrorNames = await mirrorService.getHealthyMirrorNames(true)
      // A new queue may have replaced the configuration while the health probe
      // was in flight. Never apply the old probe result to that queue.
      const options = this.currentOptions
      if (!options || this.queueId !== refreshQueueId) {
        return
      }
      const availableMirrors = DefaultBeatmapMirrors.filter(
        (mirror) =>
          options.sources.includes(mirror.name) &&
          (!options.noVideo || mirror.supportsNoVideo !== false) &&
          healthyMirrorNames.has(mirror.name)
      )
      // Keep the last usable set if a health probe temporarily reports every
      // mirror offline; per-mirror cooldowns still prevent hot-looping.
      if (availableMirrors.length === 0) {
        return
      }
      const previousNames = new Set(this.currentMirrors.map((mirror) => mirror.name))
      const nextNames = new Set(availableMirrors.map((mirror) => mirror.name))
      if (
        availableMirrors.length === this.currentMirrors.length &&
        availableMirrors.every((mirror) => previousNames.has(mirror.name))
      ) {
        return
      }

      this.currentMirrors = availableMirrors
      const perMirrorConcurrency = Math.max(
        1,
        Math.ceil(this.getGlobalConcurrencyLimit(options) / Math.max(1, availableMirrors.length))
      )
      for (const state of this.mirrorStates.values()) {
        if (nextNames.has(state.mirror.name)) {
          state.maxConcurrency = perMirrorConcurrency
        }
      }
      for (const mirror of availableMirrors) {
        if (!this.mirrorStates.has(mirror.name)) {
          this.mirrorStates.set(mirror.name, {
            mirror,
            activeDownloads: 0,
            maxConcurrency: perMirrorConcurrency,
            cooldownUntil: 0,
            rateLimitCount: 0,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0
          })
        }
      }
      if (is.dev) {
        console.log(
          `[DownloadDebug] mirror availability updated available=[${availableMirrors
            .map((mirror) => mirror.name)
            .join(', ')}]`
        )
      }
    })()
      .catch((error) => {
        console.warn('[DownloadDebug] mirror availability refresh failed:', error)
      })
      .finally(() => {
        this.mirrorHealthRefreshInFlight = undefined
        this.scheduleDownloads()
      })
  }

  private pickNextRunnableTask(): { task: DownloadTask; mirror: MirrorRuntimeState } | null {
    const now = Date.now()
    for (const task of this.tasks.values()) {
      if (task.status !== 'waiting') {
        continue
      }
      if (task.nextRetryAt && task.nextRetryAt > now) {
        continue
      }
      const mirror = this.pickAvailableMirror(task, now)
      if (mirror) {
        return { task, mirror }
      }
    }
    return null
  }

  private pickAvailableMirror(task: DownloadTask, now: number): MirrorRuntimeState | null {
    const tried = new Set(task.triedMirrors ?? [])
    const currentMirrorNames = new Set(this.currentMirrors.map((mirror) => mirror.name))
    const available = Array.from(this.mirrorStates.values()).filter(
      (state) =>
        currentMirrorNames.has(state.mirror.name) &&
        state.cooldownUntil <= now &&
        state.activeDownloads < state.maxConcurrency
    )
    if (available.length === 0) {
      return null
    }

    const untried = available.filter((state) => !tried.has(state.mirror.name))
    if (tried.size < this.currentMirrors.length && untried.length === 0) {
      return null
    }
    const candidates = untried.length > 0 ? untried : available
    candidates.sort((a, b) => {
      if (a.activeDownloads !== b.activeDownloads) {
        return a.activeDownloads - b.activeDownloads
      }
      return a.consecutiveFailures - b.consecutiveFailures
    })
    return candidates[0]
  }

  private startTask(task: DownloadTask, mirrorState: MirrorRuntimeState): void {
    task.mirror = mirrorState.mirror
    task.assignedMirror = mirrorState.mirror.name
    task.lastUsedMirror = mirrorState.mirror.name
    task.status = 'downloading'
    task.progress = task.progress >= 100 ? 0 : task.progress
    task.speed = 0
    task.remainingTime = 0
    task.error = undefined
    task.nextRetryAt = undefined
    this.touchTask(task)
    mirrorState.activeDownloads++
    this.activeDownloads++
    this.emit(DownloadEvent.TASK_UPDATED, task)
    this.schedulePersistCheckpoint()

    if (is.dev) {
      console.log(
        `[DownloadDebug] download.start set=${task.beatmapsetId} attempt=${task.attemptCount}` +
          ` mirror=${mirrorState.mirror.name} active=${this.activeDownloads}/${this.getGlobalConcurrencyLimit()}`
      )
    }

    void this.runTask(task, mirrorState)
  }

  private async runTask(task: DownloadTask, mirrorState: MirrorRuntimeState): Promise<void> {
    const options = this.currentOptions
    const taskDownloadPath = task.downloadPath || options?.downloadPath || getDefaultDownloadPath()
    const startMirrorName = mirrorState.mirror.name
    const startTime = Date.now()

    try {
      const result = await downloadFile(task, taskDownloadPath, (updatedTask) => {
        this.emit(DownloadEvent.TASK_UPDATED, updatedTask)
      })

      if (this.tasks.get(task.id) !== task) {
        return
      }

      const health = this.mirrorHealth.get(startMirrorName) || {
        success: 0,
        failure: 0,
        avgResponseTime: 0
      }
      health.success++
      health.avgResponseTime =
        (health.avgResponseTime * (health.success - 1) + (Date.now() - result.startTime)) /
        health.success
      this.mirrorHealth.set(startMirrorName, health)

      mirrorState.rateLimitCount = 0
      mirrorState.consecutiveFailures = 0
      mirrorState.consecutiveSuccesses++
      task.status = 'completed'
      task.progress = 100
      task.speed = 0
      task.remainingTime = 0
      task.error = undefined
      task.assignedMirror = undefined
      task.nextRetryAt = undefined
      this.touchTask(task)

      if (is.dev) {
        console.log(
          `[DownloadDebug] download.ok set=${task.beatmapsetId} mirror=${startMirrorName}` +
            ` ms=${Date.now() - startTime} mirrorHealth={ok:${health.success},fail:${health.failure}}`
        )
      }

      this.emit(DownloadEvent.TASK_COMPLETED, task)
      this.schedulePersistCheckpoint()
    } catch (error) {
      if (this.tasks.get(task.id) === task) {
        this.handleDownloadFailure(task, mirrorState, error)
      }
    } finally {
      mirrorState.activeDownloads = Math.max(0, mirrorState.activeDownloads - 1)
      this.activeDownloads = Math.max(0, this.activeDownloads - 1)
      if (this.tasks.get(task.id) === task && task.status === 'downloading') {
        task.status = 'waiting'
        task.assignedMirror = undefined
        this.touchTask(task)
        this.emit(DownloadEvent.TASK_UPDATED, task)
      }
      this.scheduleDownloads()
    }
  }

  private handleDownloadFailure(
    task: DownloadTask,
    mirrorState: MirrorRuntimeState,
    error: unknown
  ): void {
    const mirrorName = mirrorState.mirror.name
    const errorMessage = error instanceof Error ? error.message : String(error)
    const failureKind = this.classifyFailure(error)

    if (failureKind === 'rate-limit' || failureKind === 'transient') {
      const health = this.mirrorHealth.get(mirrorName) || {
        success: 0,
        failure: 0,
        avgResponseTime: 0
      }
      health.failure++
      this.mirrorHealth.set(mirrorName, health)
      mirrorState.consecutiveFailures++
      mirrorState.consecutiveSuccesses = 0
    }

    if (is.dev) {
      const health = this.mirrorHealth.get(mirrorName)
      console.log(
        `[DownloadDebug] download.fail set=${task.beatmapsetId} mirror=${mirrorName}` +
          ` itemAttempts=${task.attemptCount ?? 0} mirrorAttempts=${task.mirrorAttemptCount ?? 0}` +
          ` kind=${failureKind} error=${errorMessage}` +
          ` mirrorHealth={ok:${health?.success ?? 0},fail:${health?.failure ?? 0}}`
      )
    }

    task.assignedMirror = undefined
    task.lastErrorAt = Date.now()

    if (failureKind === 'cancelled') {
      task.status = 'waiting'
      task.error = 'Download cancelled'
      task.nextRetryAt = undefined
      this.touchTask(task)
      this.emit(DownloadEvent.TASK_UPDATED, task)
      this.schedulePersistCheckpoint()
      return
    }

    // A cancelled request (for example, pause without waiting for active files)
    // did not actually test the mirror, so leave the mirror rotation unchanged.
    task.triedMirrors = Array.from(new Set([...(task.triedMirrors ?? []), mirrorName]))

    // Only an item-level miss consumes the item's retry budget. Mirror and
    // network failures use a separate budget so an unhealthy mirror cannot
    // exhaust retries for otherwise downloadable items.
    if (failureKind === 'not-found') {
      task.attemptCount = (task.attemptCount ?? 0) + 1
    } else if (failureKind !== 'permanent') {
      task.mirrorAttemptCount = (task.mirrorAttemptCount ?? 0) + 1
    }

    if (failureKind === 'rate-limit' || failureKind === 'transient') {
      this.applyMirrorCooldown(mirrorState, error, failureKind)
    }

    if (failureKind === 'permanent') {
      this.failTask(task, errorMessage)
      return
    }

    if (failureKind === 'not-found' && this.hasTriedEveryMirror(task)) {
      this.failTask(task, `Not found on selected mirrors: ${errorMessage}`)
      return
    }

    if (!this.canRetryTask(task, failureKind)) {
      this.failTask(task, errorMessage)
      return
    }

    const delay = this.getRetryDelay(task, failureKind)
    task.status = 'waiting'
    task.error = errorMessage
    task.nextRetryAt = Date.now() + delay
    if (failureKind !== 'not-found' && this.hasTriedEveryMirror(task)) {
      task.triedMirrors = []
    }
    this.touchTask(task)
    this.emit(DownloadEvent.TASK_UPDATED, task)
    this.schedulePersistCheckpoint()
  }

  private classifyFailure(error: unknown): FailureKind {
    if (error instanceof Error && error.message === 'Download aborted') {
      return 'cancelled'
    }
    if (error instanceof DownloadHttpError) {
      if (error.statusCode === 429) {
        return 'rate-limit'
      }
      if (error.statusCode === 408) {
        return 'transient'
      }
      // 403 Forbidden is typically a Cloudflare / mirror-level block (transient mirror failure).
      if (error.statusCode === 403) {
        return 'transient'
      }
      // 4xx status codes (404 Not Found, 410 Gone, 451 Unavailable/DMCA, 400 Bad Request, etc.)
      // are item-specific errors on this mirror, NOT mirror infrastructure degradation.
      // NOTE: 404, 410, 451 → not-found, item only fails after hasTriedEveryMirror.
      if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
        return 'not-found'
      }
      return 'transient'
    }
    const message = error instanceof Error ? error.message : String(error)
    if (/429|rate.?limit|too many requests/i.test(message)) {
      return 'rate-limit'
    }
    if (/408|403|request.?timeout|forbidden/i.test(message)) {
      return 'transient'
    }
    if (/404|410|451|not found|gone|unavailable|dmca/i.test(message)) {
      return 'not-found'
    }
    if (/EACCES|EPERM|ENOSPC|permission|no space/i.test(message)) {
      return 'permanent'
    }
    return 'transient'
  }

  private applyMirrorCooldown(
    mirrorState: MirrorRuntimeState,
    error: unknown,
    failureKind: 'rate-limit' | 'transient'
  ): void {
    if (failureKind === 'rate-limit') {
      mirrorState.rateLimitCount++
    }
    const retryAfterMs = error instanceof DownloadHttpError ? error.retryAfterMs : undefined
    const failureBackoffMs = Math.min(
      MAX_MIRROR_COOLDOWN_MS,
      BASE_MIRROR_COOLDOWN_MS * 2 ** Math.max(0, mirrorState.consecutiveFailures - 1)
    )
    const rateLimitBackoffMs = Math.min(
      MAX_RATE_LIMIT_COOLDOWN_MS,
      BASE_RATE_LIMIT_COOLDOWN_MS * 2 ** Math.max(0, mirrorState.rateLimitCount - 1)
    )
    const cooldownMs =
      failureKind === 'rate-limit' ? (retryAfterMs ?? rateLimitBackoffMs) : failureBackoffMs
    mirrorState.cooldownUntil = Date.now() + cooldownMs
    if (is.dev) {
      console.log(
        `[DownloadDebug] mirror.cooldown mirror=${mirrorState.mirror.name}` +
          ` cooldownMs=${cooldownMs} rateLimitCount=${mirrorState.rateLimitCount}`
      )
    }
  }

  private getRetryDelay(task: DownloadTask, failureKind: FailureKind): number {
    if (failureKind === 'not-found') {
      return 0
    }
    const attempts = Math.max(1, task.mirrorAttemptCount ?? 1)
    return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempts - 1))
  }

  private canRetryTask(task: DownloadTask, failureKind: FailureKind): boolean {
    const maxAttempts = Math.max(5, this.currentMirrors.length * 2)
    const attempts = failureKind === 'not-found' ? task.attemptCount : task.mirrorAttemptCount
    return (attempts ?? 0) < maxAttempts
  }

  private hasTriedEveryMirror(task: DownloadTask): boolean {
    const tried = new Set(task.triedMirrors ?? [])
    return this.currentMirrors.every((mirror) => tried.has(mirror.name))
  }

  private failTask(task: DownloadTask, errorMessage: string): void {
    task.status = 'error'
    task.error = errorMessage
    task.nextRetryAt = undefined
    task.assignedMirror = undefined
    this.touchTask(task)
    this.emit(DownloadEvent.TASK_ERROR, task)
    this.schedulePersistCheckpoint()
  }

  private scheduleNextWakeup(): void {
    if (this.isPaused) {
      return
    }
    const nextWakeupMs = this.getNextWakeupMs()
    if (nextWakeupMs === null) {
      return
    }
    this.schedulerTimer = setTimeout(() => {
      this.schedulerTimer = undefined
      this.scheduleDownloads()
    }, nextWakeupMs)
  }

  private getNextWakeupMs(): number | null {
    const now = Date.now()
    let next: number | null = null
    for (const task of this.tasks.values()) {
      if (task.status === 'waiting' && task.nextRetryAt && task.nextRetryAt > now) {
        next = next === null ? task.nextRetryAt : Math.min(next, task.nextRetryAt)
      }
    }
    for (const state of this.mirrorStates.values()) {
      if (state.cooldownUntil > now) {
        next = next === null ? state.cooldownUntil : Math.min(next, state.cooldownUntil)
      }
    }
    return next === null ? null : Math.max(1, next - now)
  }

  private clearSchedulerTimer(): void {
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer)
      this.schedulerTimer = undefined
    }
  }

  private getMirrorUsageLogPath(downloadPath: string, reason: 'completed' | 'cancelled'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return path.join(downloadPath, `download-mirror-usage-${reason}-${timestamp}.txt`)
  }

  private async exportMirrorUsageLog(reason: 'completed' | 'cancelled'): Promise<void> {
    if (!this.queueId || this.mirrorUsageLogQueueId === this.queueId || this.tasks.size === 0) {
      return
    }

    const rows = Array.from(this.tasks.values())
      .filter((task) => task.lastUsedMirror)
      .map((task) => `${task.beatmapsetId} - ${task.lastUsedMirror}`)

    if (rows.length === 0) {
      return
    }

    this.mirrorUsageLogQueueId = this.queueId
    const firstTask = this.tasks.values().next().value as DownloadTask | undefined
    const downloadPath =
      firstTask?.downloadPath || this.currentOptions?.downloadPath || getDefaultDownloadPath()
    const logPath = this.getMirrorUsageLogPath(downloadPath, reason)

    try {
      const resolvedDownloadPath = path.resolve(downloadPath)
      const isRoot = resolvedDownloadPath === path.parse(resolvedDownloadPath).root
      if (!isRoot && !fs.existsSync(downloadPath)) {
        await fs.promises.mkdir(downloadPath, { recursive: true })
      }
      await fs.promises.writeFile(logPath, `${rows.join('\n')}\n`, 'utf-8')
      if (is.dev)
        console.log(`[DownloadDebug] mirrorUsageLog.${reason} path=${logPath} rows=${rows.length}`)
    } catch (error) {
      this.mirrorUsageLogQueueId = null
      console.error(`[DownloadDebug] Failed to write mirror usage log(${reason}):`, error)
    }
  }

  private checkQueueCompletion(): void {
    if (this.tasks.size === 0) {
      return
    }
    const hasActive = Array.from(this.tasks.values()).some(
      (t) => t.status !== 'completed' && t.status !== 'error'
    )
    if (hasActive || this.activeDownloads > 0) {
      return
    }

    const total = this.tasks.size
    const success = Array.from(this.tasks.values()).filter((t) => t.status === 'completed').length
    const failed = Array.from(this.tasks.values()).filter((t) => t.status === 'error').length
    const anyTask = this.tasks.values().next().value as DownloadTask | undefined
    const dlPath = anyTask?.downloadPath ?? null
    const durationMs = this.queueStartTime ? Date.now() - this.queueStartTime : 0

    this.debugQueueState('checkQueueCompletion.done', {
      total,
      success,
      failed,
      durationMs
    })

    void this.exportMirrorUsageLog('completed')

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

  public async pauseQueue(): Promise<void> {
    const shouldWaitForCompletion = getWaitForDownloadsOnPause()

    this.debugQueueState('pauseQueue.before', { shouldWaitForCompletion })
    this.isPaused = true
    this.clearSchedulerTimer()

    if (!shouldWaitForCompletion) {
      for (const task of this.tasks.values()) {
        if (task.status === 'downloading') {
          task.request?.destroy(new Error('Download aborted'))
        }
      }
    }

    this.emit(DownloadEvent.QUEUE_PAUSED)
    this.schedulePersistCheckpoint()
    this.debugQueueState('pauseQueue.after')
  }

  public resumeQueue(): void {
    this.isPaused = false
    this.debugQueueState('resumeQueue')
    this.emit(DownloadEvent.QUEUE_RESUMED)
    this.schedulePersistCheckpoint()
    this.scheduleDownloads()
  }

  public clearQueue(emitEvent = true): void {
    this.clearSchedulerTimer()
    if (emitEvent) {
      void this.exportMirrorUsageLog('cancelled')
    }
    for (const task of this.tasks.values()) {
      if (task.status === 'downloading') {
        task.request?.destroy(new Error('Download aborted'))
      }
    }
    this.tasks.clear()
    this.currentMirrors = []
    this.currentOptions = null
    this.queueId = null
    this.mirrorStates.clear()
    this.activeDownloads = 0
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
    return Array.from(this.tasks.values()).filter((task) => task.status === 'waiting').length
  }

  public getPendingSize(): number {
    return this.activeDownloads
  }

  public getMirrorHealth(): Map<string, MirrorHealth> {
    return this.mirrorHealth
  }
}

export default DownloadService
