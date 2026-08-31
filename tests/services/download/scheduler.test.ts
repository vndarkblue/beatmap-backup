import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/tmp'
  }
}))

import DownloadService from '../../../src/services/downloadService'
import { DownloadHttpError } from '../../../src/services/download/httpDownloader'
import { DefaultBeatmapMirrors, type BeatmapMirror } from '../../../src/config/beatmapMirrors'
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
    mirrorStates: Map<string, unknown>
    refreshMirrorAvailability: () => void
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
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
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
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
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
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
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
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
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
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
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
            title: 'S',
            artist: 'A',
            creator: 'C',
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
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
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
  })
})
