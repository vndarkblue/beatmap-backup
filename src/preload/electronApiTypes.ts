import type {
  CollectionPreviewResult,
  CollectionSyncStatus,
  CollectionExportStats,
  CollectionMergeMode
} from '../services/collection/types'
import type { DatabaseStatus, SyncProgressEvent } from '../services/database/types'
import type { StartupAutoDetectResult } from '../services/startupAutoDetect'
import type { MirrorStatus } from '../services/beatmapMirrorService'
import type { DownloadOptions, DownloadTask } from '../services/download/types'
import type { Settings as AppSettings } from '../services/settingsStore'

export type {
  AppSettings,
  StartupAutoDetectResult,
  DatabaseStatus,
  SyncProgressEvent,
  MirrorStatus
}
export type { DownloadOptions, DownloadTask }
export type {
  CollectionPreviewResult,
  CollectionSyncStatus,
  CollectionExportStats,
  CollectionMergeMode
}

export interface PathValidationResult {
  valid: boolean
  error: string | null
}

export interface QueueRuntimeState {
  hasQueue: boolean
  isPaused: boolean
  taskCount: number
  waitingCount: number
  downloadingCount: number
}

export interface RecoveryState {
  canResume: boolean
  queueId: string | null
  taskCount: number
  waitingCount: number
  downloadingCount: number
  snapshotUpdatedAt: number | null
}

export interface DownloadQueueSummary {
  total: number
  success: number
  failed: number
  downloadPath: string | null
  durationMs: number
}

export type DownloadPushEvent =
  | { event: 'tasksAdded'; data: DownloadTask[] }
  | { event: 'taskUpdated'; data: DownloadTask }
  | { event: 'taskCompleted'; data: DownloadTask }
  | { event: 'taskError'; data: DownloadTask }
  | { event: 'queuePaused'; data: null }
  | { event: 'queueResumed'; data: null }
  | { event: 'queueCleared'; data: null }
  | { event: 'queueCompleted'; data: DownloadQueueSummary }
  | { event: 'initialState'; data: DownloadTask[] }
  | { event: 'initialStateChunk'; data: DownloadTask[] }
  | { event: 'initialStateComplete'; data: null }

export interface ExportDataOptions {
  stable: boolean
  lazer: boolean
  backupOnlineIds?: boolean
  backupLocalBeatmaps?: boolean
  backupByCollection?: boolean
  collectionMergeMode?: CollectionMergeMode
  selectedCollections?: string[]
}

export interface ExportDataResult {
  success: boolean
  count: number
  outputPath: string
  stats?: CollectionExportStats
  local?: {
    count: number
    outputPath: string
    skipped: {
      withBeatmapsetId: number
      withoutOsuFile: number
      withoutMatchingCollectionMd5: number
    }
  }
  localLazer?: {
    count: number
    outputPath: string
    skipped: {
      noExportableFiles: number
      totalMissingFiles: number
    }
  }
  error?: string
}

export interface ExportEstimateResult {
  count: number
  estimatedBytes: number
  localCount?: number
}

export interface PreviewCollectionOptions {
  stable: boolean
  lazer: boolean
  mergeMode: CollectionMergeMode
}

export interface ManualSyncResult {
  success: boolean
  executed?: boolean
  reason?: 'running' | 'cooldown'
  retryAfterMs?: number
  error?: string
  status?: CollectionSyncStatus
}

export interface LocalExportProgress {
  current: number
  total: number
  percent: number
  currentBeatmap?: string
}

export interface ElectronApi {
  settings: {
    get: () => Promise<AppSettings>
    update: (patch: Partial<AppSettings>) => Promise<{ success: boolean }>
    reset: () => Promise<{ success: boolean }>
    validatePath: (
      target: 'stable' | 'lazer' | 'download',
      customPath?: string
    ) => Promise<PathValidationResult>
    getAutoDetectStatus: () => Promise<StartupAutoDetectResult>
  }
  download: {
    start: (payload: {
      filePath: string
      options: DownloadOptions
      downloadPath?: string
    }) => Promise<{ success: boolean; message?: string }>
    control: (action: 'pause' | 'resume' | 'stop') => Promise<{ success: boolean }>
    getState: () => Promise<{
      runtime: QueueRuntimeState
      recovery: RecoveryState
    }>
    handleRecovery: (action: 'resume' | 'discard') => Promise<{ success: boolean }>
    getTasks: () => Promise<DownloadTask[]>
    onEvent: (listener: (event: DownloadPushEvent) => void) => () => void
  }
  database: {
    getStatus: () => Promise<DatabaseStatus>
    sync: (options?: {
      source?: 'stable' | 'lazer' | 'all'
      force?: boolean
    }) => Promise<{ success: boolean }>
    syncCollections: () => Promise<ManualSyncResult>
    getCollectionStatus: () => Promise<CollectionSyncStatus>
    filterBeatmaps: (filter: Record<string, unknown>) => Promise<unknown>
    onSyncProgress: (listener: (progress: SyncProgressEvent) => void) => () => void
  }
  backup: {
    previewCollections: (options: PreviewCollectionOptions) => Promise<CollectionPreviewResult>
    estimate: (options: ExportDataOptions) => Promise<ExportEstimateResult>
    export: (options: ExportDataOptions) => Promise<ExportDataResult>
    onLocalExportProgress: (listener: (progress: LocalExportProgress) => void) => () => void
  }
  system: {
    selectDirectory: () => Promise<string>
    selectBackupFile: () => Promise<string>
    openPath: (targetPath: string) => Promise<string>
    getMirrorsStatus: () => Promise<MirrorStatus[]>
  }
}
