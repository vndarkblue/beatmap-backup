import type {
  CollectionPreviewResult,
  CollectionSyncStatus,
  CollectionExportStats
} from '../services/collection/types'

export interface ExportDataOptions {
  stable: boolean
  lazer: boolean
  backupByCollection?: boolean
  collectionMergeMode?: 'merge' | 'split'
  selectedCollections?: string[]
}

export interface ExportDataResult {
  success: boolean
  count: number
  outputPath: string
  stats?: CollectionExportStats
  error?: string
}

export interface ManualSyncResult {
  success: boolean
  executed?: boolean
  reason?: 'running' | 'cooldown'
  retryAfterMs?: number
  error?: string
  status?: CollectionSyncStatus
}

export interface PreviewCollectionOptions {
  stable: boolean
  lazer: boolean
  mergeMode: 'merge' | 'split'
}

export interface ElectronApi {
  selectDirectory: () => Promise<string>
  checkSubDir: (dir: string, sub: string) => Promise<boolean>
  checkFile: (dir: string, file: string) => Promise<boolean>
  getFilePath: () => Promise<string>
  previewCollections: (options: PreviewCollectionOptions) => Promise<CollectionPreviewResult>
  syncCollectionMd5Cache: () => Promise<ManualSyncResult>
  getCollectionSyncStatus: () => Promise<CollectionSyncStatus>
  exportData: (options: ExportDataOptions) => Promise<ExportDataResult>
  openPath: (targetPath: string) => Promise<string>
}
