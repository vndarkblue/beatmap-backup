import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  QueuePersistence,
  QUEUE_SNAPSHOT_VERSION,
  type QueueSnapshot
} from '../../../src/services/download/queuePersistence'
import { DefaultBeatmapMirrors } from '../../../src/config/beatmapMirrors'
import type { DownloadTask } from '../../../src/services/download/types'

describe('QueuePersistence', () => {
  let tempDir: string
  let tempFilePath: string
  let persistence: QueuePersistence

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'queue-persist-test-'))
    tempFilePath = path.join(tempDir, 'download-queue-state.json')
    persistence = new QueuePersistence(tempFilePath)
  })

  afterEach(async () => {
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('returns custom snapshot path correctly', () => {
    expect(persistence.getSnapshotPath()).toBe(tempFilePath)
  })

  it('reads null when snapshot file does not exist (ENOENT)', async () => {
    const result = await persistence.readSnapshot()
    expect(result).toBeNull()
  })

  it('saves snapshot and reads it back accurately in round-trip', async () => {
    const sampleSnapshot: QueueSnapshot = {
      version: QUEUE_SNAPSHOT_VERSION,
      queueId: 'q-test-123',
      createdAt: 1000,
      updatedAt: 2000,
      options: {
        sources: ['osu.direct'],
        noVideo: true,
        downloadPath: 'C:/downloads',
        concurrency: 3
      },
      rotation: {
        currentMirrorIndex: 0,
        currentRotationLimit: 10,
        mirrorCompletionCounts: { 'osu.direct': 5 }
      },
      scheduler: {
        mirrors: [
          {
            name: 'osu.direct',
            cooldownUntil: 0,
            rateLimitCount: 0,
            consecutiveFailures: 0,
            consecutiveSuccesses: 5
          }
        ]
      },
      tasks: [
        {
          id: 'task-1',
          beatmapsetId: '1001',
          title: 'Test Song',
          artist: 'Test Artist',
          creator: 'Mapper',
          status: 'completed',
          progress: 100,
          speed: 0,
          remainingTime: 0,
          noVideo: true,
          filePath: 'C:/downloads/1001.osz',
          mirrorName: 'osu.direct'
        }
      ]
    }

    await persistence.saveSnapshot(sampleSnapshot)
    const read = await persistence.readSnapshot()

    expect(read).toEqual(sampleSnapshot)
  })

  it('migrates version 1 snapshot to version 2 by attaching scheduler structure', async () => {
    const v1Data = {
      version: 1,
      queueId: 'q-v1-old',
      createdAt: 1000,
      updatedAt: 1500,
      options: {
        sources: ['osu.direct'],
        noVideo: false,
        downloadPath: 'C:/downloads',
        concurrency: 2
      },
      tasks: []
    }

    await fs.promises.writeFile(tempFilePath, JSON.stringify(v1Data), 'utf-8')
    const read = await persistence.readSnapshot()

    expect(read).not.toBeNull()
    expect(read?.version).toBe(2)
    expect(read?.scheduler).toEqual({ mirrors: [] })
    expect(read?.queueId).toBe('q-v1-old')
  })

  it('returns null when snapshot has invalid or unknown version', async () => {
    const v99Data = {
      version: 99,
      queueId: 'future-queue',
      tasks: []
    }

    await fs.promises.writeFile(tempFilePath, JSON.stringify(v99Data), 'utf-8')
    const read = await persistence.readSnapshot()
    expect(read).toBeNull()
  })

  it('clears existing snapshot file', async () => {
    await fs.promises.writeFile(tempFilePath, JSON.stringify({ version: 2, tasks: [] }), 'utf-8')
    expect(fs.existsSync(tempFilePath)).toBe(true)

    await persistence.clearSnapshot()
    expect(fs.existsSync(tempFilePath)).toBe(false)
  })

  it('clearSnapshot does not throw if snapshot file does not exist', async () => {
    await expect(persistence.clearSnapshot()).resolves.toBeUndefined()
  })

  it('serializes download tasks by stripping non-serializable fields and extracting mirrorName', () => {
    const mirror = DefaultBeatmapMirrors[0]
    const tasks: DownloadTask[] = [
      {
        id: 'task-1',
        beatmapsetId: '1234',
        title: 'Song',
        artist: 'Artist',
        creator: 'Creator',
        status: 'downloading',
        progress: 50,
        speed: 1024,
        remainingTime: 10,
        noVideo: false,
        mirror,
        triedMirrors: ['osu.direct']
      }
    ]

    const serialized = persistence.serializeTasks(tasks)
    expect(serialized).toHaveLength(1)
    expect(serialized[0].mirrorName).toBe(mirror.name)
    expect((serialized[0] as unknown as { mirror?: unknown }).mirror).toBeUndefined()
    expect((serialized[0] as unknown as { request?: unknown }).request).toBeUndefined()
    expect(serialized[0].triedMirrors).toEqual(['osu.direct'])
  })

  it('deserializes tasks by matching mirror names and fallback to default mirror when unknown', () => {
    const defaultMirror = DefaultBeatmapMirrors[0]
    const targetMirror = DefaultBeatmapMirrors[1] ?? defaultMirror

    const persistedTasks = [
      {
        id: 'task-1',
        beatmapsetId: '1001',
        title: 'Known Mirror Task',
        artist: 'Artist',
        creator: 'Creator',
        status: 'waiting' as const,
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: false,
        mirrorName: targetMirror.name,
        triedMirrors: [targetMirror.name]
      },
      {
        id: 'task-2',
        beatmapsetId: '1002',
        title: 'Unknown Mirror Task',
        artist: 'Artist',
        creator: 'Creator',
        status: 'waiting' as const,
        progress: 0,
        speed: 0,
        remainingTime: 0,
        noVideo: true,
        mirrorName: 'NonExistentMirror_XYZ'
      }
    ]

    const deserialized = persistence.deserializeTasks(persistedTasks)

    expect(deserialized).toHaveLength(2)
    expect(deserialized[0].mirror).toEqual(targetMirror)
    expect(deserialized[0].triedMirrors).toEqual([targetMirror.name])

    // Unknown mirror falls back to DefaultBeatmapMirrors[0]
    expect(deserialized[1].mirror).toEqual(defaultMirror)
    expect(deserialized[1].triedMirrors).toEqual([])
  })
})
