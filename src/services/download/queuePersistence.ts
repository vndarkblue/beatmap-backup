import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { DefaultBeatmapMirrors } from '../../config/beatmapMirrors'
import type { DownloadOptions, DownloadTask } from './types'

const SNAPSHOT_VERSION = 1
const SNAPSHOT_FILE_NAME = 'download-queue-state.json'

type PersistedTask = Omit<DownloadTask, 'mirror' | 'request'> & {
  mirrorName: string
}

export interface QueueSnapshot {
  version: number
  queueId: string
  createdAt: number
  updatedAt: number
  options: DownloadOptions
  rotation: {
    currentMirrorIndex: number
    currentRotationLimit: number
    mirrorCompletionCounts: Record<string, number>
  }
  tasks: PersistedTask[]
}

export class QueuePersistence {
  private readonly filePath: string

  constructor(customPath?: string) {
    if (customPath) {
      this.filePath = customPath
      return
    }
    const baseDir = app.getPath('userData')
    this.filePath = path.join(baseDir, SNAPSHOT_FILE_NAME)
  }

  public getSnapshotPath(): string {
    return this.filePath
  }

  public async saveSnapshot(snapshot: QueueSnapshot): Promise<void> {
    const folder = path.dirname(this.filePath)
    await fs.promises.mkdir(folder, { recursive: true })
    const tmpPath = `${this.filePath}.tmp`
    await fs.promises.writeFile(tmpPath, JSON.stringify(snapshot), 'utf-8')
    await fs.promises.rename(tmpPath, this.filePath)
  }

  public async readSnapshot(): Promise<QueueSnapshot | null> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as QueueSnapshot
      if (parsed.version !== SNAPSHOT_VERSION) {
        return null
      }
      return parsed
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null
      }
      throw error
    }
  }

  public async clearSnapshot(): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath)
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return
      }
      throw error
    }
  }

  public serializeTasks(tasks: DownloadTask[]): PersistedTask[] {
    return tasks.map(({ mirror, request, ...task }) => ({
      ...task,
      mirrorName: mirror.name,
    }))
  }

  public deserializeTasks(tasks: PersistedTask[]): DownloadTask[] {
    const mirrorMap = new Map(DefaultBeatmapMirrors.map((m) => [m.name, m]))
    return tasks.map((task) => ({
      ...task,
      mirror: mirrorMap.get(task.mirrorName) ?? DefaultBeatmapMirrors[0],
      request: undefined
    }))
  }
}

export const QUEUE_SNAPSHOT_VERSION = SNAPSHOT_VERSION
