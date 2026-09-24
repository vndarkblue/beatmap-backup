import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/tmp'
  }
}))

import DownloadService from '../../../src/services/downloadService'
import { DownloadHttpError } from '../../../src/services/download/httpDownloader'
import {
  DefaultBeatmapMirrors,
  setBeatconnectRuntimeToken,
  type BeatmapMirror
} from '../../../src/config/beatmapMirrors'
import type { DownloadTask } from '../../../src/services/download/types'

describe('DownloadService Scheduler & Failure Handling', () => {
  const service = DownloadService.getInstance()

  // Access private methods using type assertion helper
  const internal = service as unknown as {
    classifyFailure: (err: unknown) => string
    canRetryTask: (task: DownloadTask, failureKind: string) => boolean
    hasTriedEveryMirror: (task: DownloadTask) => boolean
    getRetryDelay: (task: DownloadTask, failureKind: string) => number
    applyMirrorCooldown: (
      mirrorState: {
        mirror: BeatmapMirror
        activeDownloads: number
        maxConcurrency: number
        cooldownUntil: number
        rateLimitCount: number
        consecutiveFailures: number
        consecutiveSuccesses: number
      },
      error: unknown,
      failureKind: 'rate-limit' | 'transient'
    ) => void
    currentMirrors: BeatmapMirror[]
    mirrorStates: Map<
      string,
      {
        mirror: BeatmapMirror
        activeDownloads: number
        maxConcurrency: number
        cooldownUntil: number
        rateLimitCount: number
        consecutiveFailures: number
        consecutiveSuccesses: number
        lastDispatchAt: number
        dispatchHistory: number[]
      }
    >
    refreshMirrorAvailability: () => void
    initializeMirrorStates: (
      mirrors: BeatmapMirror[],
      options: { sources: string[]; threadCount: number; noVideo: boolean }
    ) => void
    pickAvailableMirror: (
      task: DownloadTask,
      now: number
    ) => { mirror: BeatmapMirror; activeDownloads: number; maxConcurrency: number } | null
    startTask: (
      task: DownloadTask,
      mirrorState: {
        mirror: BeatmapMirror
        activeDownloads: number
        maxConcurrency: number
        lastDispatchAt: number
        dispatchHistory: number[]
      }
    ) => void
    getNextWakeupMs: () => number | null
  }

  beforeEach(() => {
    internal.currentMirrors = [...DefaultBeatmapMirrors]
  })

  describe('classifyFailure', () => {
    it('classifies 429 as rate-limit', () => {
      expect(internal.classifyFailure(new DownloadHttpError('Rate limit', 429))).toBe('rate-limit')
      expect(internal.classifyFailure(new Error('Rate limit reached (429)'))).toBe('rate-limit')
    })

    it('classifies 408 as transient', () => {
      expect(internal.classifyFailure(new DownloadHttpError('Timeout', 408))).toBe('transient')
      expect(internal.classifyFailure(new Error('Request timeout 408'))).toBe('transient')
    })

    it('classifies 404, 410, 451 as not-found', () => {
      expect(internal.classifyFailure(new DownloadHttpError('Not found', 404))).toBe('not-found')
      expect(internal.classifyFailure(new DownloadHttpError('Gone', 410))).toBe('not-found')
      expect(
        internal.classifyFailure(new DownloadHttpError('Unavailable for legal reasons', 451))
      ).toBe('not-found')
      expect(internal.classifyFailure(new Error('HTTP 451 Unavailable'))).toBe('not-found')
      expect(internal.classifyFailure(new Error('DMCA takedown notice'))).toBe('not-found')
    })

    it('classifies 403 as transient mirror-level errors', () => {
      expect(internal.classifyFailure(new DownloadHttpError('Forbidden', 403))).toBe('transient')
      expect(internal.classifyFailure(new Error('HTTP 403 Forbidden'))).toBe('transient')
    })

    it('classifies 5xx as transient', () => {
      expect(internal.classifyFailure(new DownloadHttpError('Internal Server Error', 500))).toBe(
        'transient'
      )
      expect(internal.classifyFailure(new DownloadHttpError('Bad Gateway', 502))).toBe('transient')
      expect(internal.classifyFailure(new DownloadHttpError('Service Unavailable', 503))).toBe(
        'transient'
      )
      expect(internal.classifyFailure(new DownloadHttpError('Gateway Timeout', 504))).toBe(
        'transient'
      )
    })

    it('classifies Download aborted as cancelled', () => {
      expect(internal.classifyFailure(new Error('Download aborted'))).toBe('cancelled')
    })

    it('classifies filesystem permission errors as permanent', () => {
      expect(internal.classifyFailure(new Error('EACCES: permission denied'))).toBe('permanent')
      expect(internal.classifyFailure(new Error('ENOSPC: no space left on device'))).toBe(
        'permanent'
      )
    })
  })

  describe('canRetryTask', () => {
    it('limits retries based on max(5, currentMirrors.length * 2)', () => {
      // With 5 mirrors: maxAttempts = max(5, 5*2) = 10
      internal.currentMirrors = DefaultBeatmapMirrors.slice(0, 5)

      const task: DownloadTask = {
        id: 't-1',
        beatmapsetId: '100',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0],
        attemptCount: 9,
        mirrorAttemptCount: 9
      }

      expect(internal.canRetryTask(task, 'transient')).toBe(true)

      task.mirrorAttemptCount = 10
      expect(internal.canRetryTask(task, 'transient')).toBe(false)
    })

    it('uses attemptCount when failureKind is not-found', () => {
      internal.currentMirrors = DefaultBeatmapMirrors.slice(0, 5)

      const task: DownloadTask = {
        id: 't-2',
        beatmapsetId: '100',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0],
        attemptCount: 10,
        mirrorAttemptCount: 1
      }

      expect(internal.canRetryTask(task, 'not-found')).toBe(false)
      expect(internal.canRetryTask(task, 'transient')).toBe(true)
    })
  })

  describe('hasTriedEveryMirror', () => {
    it('returns true only when every current mirror name is present in triedMirrors', () => {
      internal.currentMirrors = [DefaultBeatmapMirrors[0], DefaultBeatmapMirrors[1]]

      const task: DownloadTask = {
        id: 't-3',
        beatmapsetId: '100',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0],
        triedMirrors: [DefaultBeatmapMirrors[0].name]
      }

      expect(internal.hasTriedEveryMirror(task)).toBe(false)

      task.triedMirrors?.push(DefaultBeatmapMirrors[1].name)
      expect(internal.hasTriedEveryMirror(task)).toBe(true)
    })
  })

  describe('getRetryDelay', () => {
    it('returns 0 delay for not-found errors so next mirror is tried immediately', () => {
      const task: DownloadTask = {
        id: 't-4',
        beatmapsetId: '100',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0],
        mirrorAttemptCount: 3
      }

      expect(internal.getRetryDelay(task, 'not-found')).toBe(0)
    })

    it('returns exponential backoff delay for transient errors', () => {
      const task: DownloadTask = {
        id: 't-5',
        beatmapsetId: '100',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0],
        mirrorAttemptCount: 1
      }

      const delay1 = internal.getRetryDelay(task, 'transient')
      expect(delay1).toBe(1000) // BASE_RETRY_DELAY_MS * 2^0

      task.mirrorAttemptCount = 2
      const delay2 = internal.getRetryDelay(task, 'transient')
      expect(delay2).toBe(2000) // BASE_RETRY_DELAY_MS * 2^1

      task.mirrorAttemptCount = 3
      const delay3 = internal.getRetryDelay(task, 'transient')
      expect(delay3).toBe(4000) // BASE_RETRY_DELAY_MS * 2^2
    })
  })

  describe('applyMirrorCooldown', () => {
    it('increments rateLimitCount and applies rate limit cooldown on rate-limit', () => {
      const state = {
        mirror: DefaultBeatmapMirrors[0],
        activeDownloads: 0,
        maxConcurrency: 3,
        cooldownUntil: 0,
        rateLimitCount: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0
      }

      const before = Date.now()
      internal.applyMirrorCooldown(state, new DownloadHttpError('Rate limit', 429), 'rate-limit')

      expect(state.rateLimitCount).toBe(1)
      expect(state.cooldownUntil).toBeGreaterThanOrEqual(before + 5000) // BASE_RATE_LIMIT_COOLDOWN_MS
    })

    it('honors retryAfterMs if provided in DownloadHttpError', () => {
      const state = {
        mirror: DefaultBeatmapMirrors[0],
        activeDownloads: 0,
        maxConcurrency: 3,
        cooldownUntil: 0,
        rateLimitCount: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0
      }

      const before = Date.now()
      internal.applyMirrorCooldown(
        state,
        new DownloadHttpError('Rate limit', 429, 15000),
        'rate-limit'
      )

      expect(state.cooldownUntil).toBeGreaterThanOrEqual(before + 15000)
    })
  })

  describe('flushCheckpointWithTimeout (F7)', () => {
    it('logs a warning when persistCheckpoint times out', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const internalService = service as unknown as {
        persistCheckpoint: (reason: string) => Promise<void>
        tasks: Map<string, DownloadTask>
      }

      // Add a dummy incomplete task
      internalService.tasks = new Map([
        [
          't-1',
          {
            id: 't-1',
            beatmapsetId: '100',
            status: 'downloading',
            progress: 50,
            speed: 0,
            remainingTime: 0,
            noVideo: false,
            mirror: DefaultBeatmapMirrors[0]
          }
        ]
      ])

      // Mock persistCheckpoint to take longer than timeoutMs
      vi.spyOn(internalService, 'persistCheckpoint').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      )

      await service.flushCheckpointWithTimeout(10)

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[QueuePersistence] flush checkpoint timed out after 10ms, 1 task(s) may not be saved'
        )
      )

      warnSpy.mockRestore()
    })

    it('does not log a warning when persistCheckpoint completes within timeout', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const internalService = service as unknown as {
        persistCheckpoint: (reason: string) => Promise<void>
      }

      vi.spyOn(internalService, 'persistCheckpoint').mockResolvedValue()

      await service.flushCheckpointWithTimeout(100)

      expect(warnSpy).not.toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('Queue Lifecycle & State methods', () => {
    it('manages recovery state accurately based on snapshots and memory', () => {
      const internalService = service as unknown as {
        queueId: string | null
        latestSnapshot: unknown
        tasks: Map<string, DownloadTask>
      }

      internalService.queueId = null
      internalService.tasks = new Map()
      internalService.latestSnapshot = null

      // When completely empty
      expect(service.getRecoveryState().canResume).toBe(false)

      // When snapshot has waiting tasks
      internalService.latestSnapshot = {
        queueId: 'q-saved',
        createdAt: 1000,
        updatedAt: 2000,
        options: { sources: ['osu.direct'], noVideo: false, downloadPath: 'C:/dl', concurrency: 2 },
        tasks: [
          {
            id: 't-saved-1',
            beatmapsetId: '100',
            status: 'waiting',
            mirrorName: 'osu.direct'
          }
        ]
      }

      const stateWithSnapshot = service.getRecoveryState()
      expect(stateWithSnapshot.canResume).toBe(true)
      expect(stateWithSnapshot.queueId).toBe('q-saved')
      expect(stateWithSnapshot.taskCount).toBe(1)
      expect(stateWithSnapshot.waitingCount).toBe(1)

      // When in-memory queue is already active, recovery should return canResume: false
      internalService.queueId = 'q-active'
      expect(service.getRecoveryState().canResume).toBe(false)
      internalService.queueId = null
    })

    it('reports queue runtime state, manages tasks and pause/resume flags', async () => {
      service.clearQueue(false)
      expect(service.getQueueRuntimeState().hasQueue).toBe(false)

      const dummyTask: DownloadTask = {
        id: 't-life',
        beatmapsetId: '555',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0]
      }

      const internalService = service as unknown as {
        tasks: Map<string, DownloadTask>
      }
      internalService.tasks.set(dummyTask.id, dummyTask)

      expect(service.getTasks()).toHaveLength(1)
      expect(service.getQueueSize()).toBe(1)

      const runtimeState = service.getQueueRuntimeState()
      expect(runtimeState.hasQueue).toBe(true)
      expect(runtimeState.taskCount).toBe(1)
      expect(runtimeState.waitingCount).toBe(1)
      expect(runtimeState.isPaused).toBe(false)

      // Test pause
      await service.pauseQueue()
      expect(service.getQueueRuntimeState().isPaused).toBe(true)

      // Test resume
      service.resumeQueue()
      expect(service.getQueueRuntimeState().isPaused).toBe(false)

      // Test clear
      service.clearQueue(false)
      expect(service.getTasks()).toHaveLength(0)
      expect(service.getQueueSize()).toBe(0)
    })

    it('retries failed tasks and retrieves failed beatmapset IDs', () => {
      const internalService = service as unknown as {
        tasks: Map<string, DownloadTask>
      }
      internalService.tasks.clear()

      const failedTask1: DownloadTask = {
        id: 't-fail1',
        beatmapsetId: '1001',
        status: 'error',
        error: 'HTTP 404',
        progress: 50,
        speed: 100,
        remainingTime: 5,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0]
      }

      const failedTask2: DownloadTask = {
        id: 't-fail2',
        beatmapsetId: '1002',
        status: 'error',
        error: 'Timeout',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0]
      }

      const completedTask: DownloadTask = {
        id: 't-done',
        beatmapsetId: '1003',
        status: 'completed',
        progress: 100,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: DefaultBeatmapMirrors[0]
      }

      internalService.tasks.set(failedTask1.id, failedTask1)
      internalService.tasks.set(failedTask2.id, failedTask2)
      internalService.tasks.set(completedTask.id, completedTask)

      // Test getFailedTaskBeatmapsetIds
      const failedIds = service.getFailedTaskBeatmapsetIds()
      expect(failedIds).toEqual([1001, 1002])

      // Test retryFailedTasks
      const retriedCount = service.retryFailedTasks()
      expect(retriedCount).toBe(2)
      expect(failedTask1.status).toBe('waiting')
      expect(failedTask1.error).toBeUndefined()
      expect(failedTask1.progress).toBe(0)
      expect(failedTask2.status).toBe('waiting')
      expect(completedTask.status).toBe('completed')

      // Cleanup
      service.clearQueue(false)
    })
  })

  describe('Mino (catboy.best) Rate Limiting & Concurrency Controls', () => {
    const minoMirror = DefaultBeatmapMirrors.find((m) => m.name === 'catboy.best')!

    beforeEach(() => {
      service.clearQueue(false)
    })

    it('caps catboy.best maxConcurrency to 2 even if threadCount is 10 and only catboy.best is selected', () => {
      internal.initializeMirrorStates([minoMirror], {
        sources: ['catboy.best'],
        threadCount: 10,
        noVideo: false
      })

      const minoState = internal.mirrorStates.get('catboy.best')
      expect(minoState).toBeDefined()
      expect(minoState?.maxConcurrency).toBe(2)
    })

    it('enforces MINO_MIN_DISPATCH_INTERVAL_MS between dispatches to catboy.best', () => {
      internal.currentMirrors = [minoMirror]
      internal.initializeMirrorStates([minoMirror], {
        sources: ['catboy.best'],
        threadCount: 2,
        noVideo: false
      })

      const task: DownloadTask = {
        id: 't-mino-1',
        beatmapsetId: '2001',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: minoMirror
      }

      const now = Date.now()
      const minoState = internal.mirrorStates.get('catboy.best')!

      // Just dispatched 100ms ago -> should NOT be picked
      minoState.lastDispatchAt = now - 100
      expect(internal.pickAvailableMirror(task, now)).toBeNull()

      // Dispatched 700ms ago (> 600ms) -> can be picked
      minoState.lastDispatchAt = now - 700
      const picked = internal.pickAvailableMirror(task, now)
      expect(picked).not.toBeNull()
      expect(picked?.mirror.name).toBe('catboy.best')
    })

    it('enforces MINO_MAX_DISPATCHES_PER_MINUTE (60/min limit)', () => {
      internal.currentMirrors = [minoMirror]
      internal.initializeMirrorStates([minoMirror], {
        sources: ['catboy.best'],
        threadCount: 2,
        noVideo: false
      })

      const task: DownloadTask = {
        id: 't-mino-2',
        beatmapsetId: '2002',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: minoMirror
      }

      const now = Date.now()
      const minoState = internal.mirrorStates.get('catboy.best')!
      minoState.lastDispatchAt = now - 1000

      // Fill with 60 timestamps within the last 60 seconds
      minoState.dispatchHistory = Array.from({ length: 60 }, (_, i) => now - 1000 - i * 500)
      expect(internal.pickAvailableMirror(task, now)).toBeNull()

      // If timestamps are older than 60s, they expire and pick succeeds
      minoState.dispatchHistory = Array.from({ length: 60 }, (_, i) => now - 61000 - i * 500)
      const picked = internal.pickAvailableMirror(task, now)
      expect(picked).not.toBeNull()
    })

    it('calculates getNextWakeupMs accurately for Mino dispatch interval', () => {
      internal.currentMirrors = [minoMirror]
      internal.initializeMirrorStates([minoMirror], {
        sources: ['catboy.best'],
        threadCount: 2,
        noVideo: false
      })

      const now = Date.now()
      const minoState = internal.mirrorStates.get('catboy.best')!
      minoState.lastDispatchAt = now - 200 // 400ms remaining until 600ms

      const wakeupMs = internal.getNextWakeupMs()
      expect(wakeupMs).toBeGreaterThanOrEqual(350)
      expect(wakeupMs).toBeLessThanOrEqual(450)
    })
  })

  describe('BeatConnect Mirror Dispatch Limits & Token Fallback', () => {
    const beatconnectMirror = DefaultBeatmapMirrors.find((m) => m.name === 'BeatConnect')!

    it('enforces unauthenticated concurrency cap of 2 and authenticated cap of 5', () => {
      setBeatconnectRuntimeToken('')
      internal.initializeMirrorStates([beatconnectMirror], {
        sources: ['BeatConnect'],
        threadCount: 10,
        noVideo: false
      })
      const unauthState = internal.mirrorStates.get('BeatConnect')!
      expect(unauthState.maxConcurrency).toBe(2)

      setBeatconnectRuntimeToken('test-patreon-token')
      internal.initializeMirrorStates([beatconnectMirror], {
        sources: ['BeatConnect'],
        threadCount: 10,
        noVideo: false
      })
      const authState = internal.mirrorStates.get('BeatConnect')!
      expect(authState.maxConcurrency).toBe(5)
      setBeatconnectRuntimeToken('')
    })

    it('enforces 150ms dispatch interval when authenticated with token', () => {
      setBeatconnectRuntimeToken('test-patreon-token')
      internal.currentMirrors = [beatconnectMirror]
      internal.initializeMirrorStates([beatconnectMirror], {
        sources: ['BeatConnect'],
        threadCount: 5,
        noVideo: false
      })

      const task: DownloadTask = {
        id: 't-bc-1',
        beatmapsetId: '200',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: beatconnectMirror
      }

      const now = Date.now()
      const bcState = internal.mirrorStates.get('BeatConnect')!
      bcState.lastDispatchAt = now - 50 // only 50ms elapsed, needs 150ms

      expect(internal.pickAvailableMirror(task, now)).toBeNull()

      bcState.lastDispatchAt = now - 160 // 160ms elapsed
      expect(internal.pickAvailableMirror(task, now)).not.toBeNull()
      setBeatconnectRuntimeToken('')
    })

    it('enforces 800ms dispatch interval when unauthenticated', () => {
      setBeatconnectRuntimeToken('')
      internal.currentMirrors = [beatconnectMirror]
      internal.initializeMirrorStates([beatconnectMirror], {
        sources: ['BeatConnect'],
        threadCount: 2,
        noVideo: false
      })

      const task: DownloadTask = {
        id: 't-bc-2',
        beatmapsetId: '201',
        status: 'waiting',
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirror: beatconnectMirror
      }

      const now = Date.now()
      const bcState = internal.mirrorStates.get('BeatConnect')!
      bcState.lastDispatchAt = now - 500 // only 500ms elapsed, needs 800ms

      expect(internal.pickAvailableMirror(task, now)).toBeNull()

      bcState.lastDispatchAt = now - 850 // 850ms elapsed
      expect(internal.pickAvailableMirror(task, now)).not.toBeNull()
    })

    it('handles 401 failure by clearing token, downgrading concurrency, and re-queuing task', () => {
      setBeatconnectRuntimeToken('expired-token')
      internal.currentMirrors = [beatconnectMirror]
      internal.initializeMirrorStates([beatconnectMirror], {
        sources: ['BeatConnect'],
        threadCount: 5,
        noVideo: false
      })

      const task: DownloadTask = {
        id: 't-bc-fail',
        beatmapsetId: '999',
        status: 'downloading',
        progress: 10,
        speed: 50,
        remainingTime: 5,
        noVideo: false,
        mirror: beatconnectMirror,
        assignedMirror: 'BeatConnect'
      }

      const internalWithFailure = service as unknown as {
        handleDownloadFailure: (task: DownloadTask, mirrorState: unknown, error: unknown) => void
      }

      const bcState = internal.mirrorStates.get('BeatConnect')!
      expect(bcState.maxConcurrency).toBe(5)

      internalWithFailure.handleDownloadFailure(
        task,
        bcState,
        new DownloadHttpError('Unauthorized', 401)
      )

      expect(task.status).toBe('waiting')
      expect(task.assignedMirror).toBeUndefined()
      expect(bcState.maxConcurrency).toBe(2) // Downgraded to unauth cap
    })
  })
})
