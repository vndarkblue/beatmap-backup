export type CollectionSource = 'stable' | 'lazer' | 'both'
export type CollectionMergeMode = 'merge' | 'split'

export interface CollectionEntry {
  name: string
  beatmapMd5s: string[]
  source: CollectionSource
}

export interface CollectionPreviewItem {
  key: string
  name: string
  source: CollectionSource
  mapCount: number
  resolvedCount: number
  pendingCount: number
  apiNotFoundCount: number
  missingLocalCount: number
}

export interface CollectionPreviewResult {
  success: boolean
  collections: CollectionPreviewItem[]
  syncStatus: CollectionSyncStatus
  error?: string
}

export interface CollectionSyncStatus {
  pending: number
  resolved: number
  notFound: number
  failed: number
  missingLocal: number
  lastRunAt: number | null
  running: boolean
}

export interface CollectionExportStats {
  resolved: number
  pendingSync: number
  missingLocal: number
  apiNotFound: number
}
