import type { BeatmapMirror } from '../../config/beatmapMirrors'
import type https from 'https'

export interface DownloadTask {
  id: string
  queueId?: string
  beatmapsetId: string
  mirror: BeatmapMirror
  noVideo: boolean
  status: 'waiting' | 'downloading' | 'completed' | 'error'
  progress: number
  speed: number
  remainingTime: number
  error?: string
  /** Directory chosen by user (or default OS Downloads) */
  downloadPath?: string
  /** Final file name and full path, set once headers are known / completed */
  fileName?: string
  filePath?: string
  createdAt?: number
  updatedAt?: number
  attemptCount?: number
  lastErrorAt?: number
  request?: ReturnType<typeof https.get>
}

export interface DownloadOptions {
  threadCount: number
  sources: string[]
  noVideo: boolean
  downloadPath?: string
  removeFromStable: boolean
  removeFromLazer: boolean
}

export enum DownloadEvent {
  TASK_ADDED = 'taskAdded',
  TASK_UPDATED = 'taskUpdated',
  TASK_COMPLETED = 'taskCompleted',
  TASK_ERROR = 'taskError',
  QUEUE_PAUSED = 'queuePaused',
  QUEUE_RESUMED = 'queueResumed',
  QUEUE_CLEARED = 'queueCleared',
  QUEUE_COMPLETED = 'queueCompleted'
}
