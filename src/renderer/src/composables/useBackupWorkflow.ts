import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { STORAGE_KEYS } from '../../../config/frontendConstants'
import type { LocalExportProgress } from '../../../preload/electronApiTypes'

export type CollectionItem = {
  key: string
  name: string
  source: 'stable' | 'lazer' | 'both'
  mapCount: number
  resolvedCount: number
  pendingCount: number
  apiNotFoundCount: number
  missingLocalCount: number
}

const STORAGE_KEY = STORAGE_KEYS.BACKUP_TOGGLE_STATE
const PREVIEW_SNAPSHOT_STORAGE_KEY = STORAGE_KEYS.BACKUP_COLLECTION_PREVIEW_SNAPSHOT
const PREVIEW_CACHE_TTL_MS = 3_000
const PREVIEW_DEBOUNCE_MS = 200

type PreviewCacheEntry = {
  at: number
  collections: CollectionItem[]
  syncStatus: {
    pending: number
    resolved: number
    notFound: number
    failed: number
    missingLocal: number
  }
}

type BackupToggleState = {
  stableBackup: boolean
  lazerBackup: boolean
  backupOnlineIds: boolean
  backupLocalBeatmaps: boolean
  backupByCollection: boolean
  mergeCollectionNames: boolean
}

type PreviewSnapshot = {
  cacheKey: string
  at: number
  collections: CollectionItem[]
  syncStatus: {
    pending: number
    resolved: number
    notFound: number
    failed: number
    missingLocal: number
  }
}

export interface UseBackupWorkflowReturn {
  stableBackup: Ref<boolean>
  lazerBackup: Ref<boolean>
  backupOnlineIds: Ref<boolean>
  backupLocalBeatmaps: Ref<boolean>
  backupByCollection: Ref<boolean>
  mergeCollectionNames: Ref<boolean>
  isExporting: Ref<boolean>
  localExportProgress: Ref<LocalExportProgress>
  isSyncing: Ref<boolean>
  isLoadingCollections: Ref<boolean>
  statusMessage: Ref<string>
  isSuccess: Ref<boolean>
  collections: Ref<CollectionItem[]>
  selectedCollectionKeys: Ref<string[]>
  collectionReadErrors: Ref<{ stable?: string; lazer?: string }>
  sortKey: Ref<'name' | 'maps' | 'source'>
  syncStatus: Ref<{
    pending: number
    resolved: number
    notFound: number
    failed: number
    missingLocal: number
  }>
  isEstimating: Ref<boolean>
  estimateMessage: Ref<string>
  estimateError: Ref<boolean>
  canUseCollectionBackup: ComputedRef<boolean>
  canExport: ComputedRef<boolean>
  allCollectionsSelected: ComputedRef<boolean>
  isCollectionSelectionIndeterminate: ComputedRef<boolean>
  sortedCollections: ComputedRef<CollectionItem[]>
  syncCooldownRemainingSeconds: ComputedRef<number>
  isSyncCoolingDown: ComputedRef<boolean>
  canTriggerSync: ComputedRef<boolean>
  setSort: (key: 'name' | 'maps' | 'source') => void
  getSortIndicator: (key: 'name' | 'maps' | 'source') => string
  getSourceLabel: (source: CollectionItem['source']) => string
  toggleSelectAllCollections: (value: boolean | null) => void
  syncMissingNow: () => Promise<void>
  handleExport: () => Promise<void>
  initialize: () => void
  teardown: () => void
}

export function useBackupWorkflow(): UseBackupWorkflowReturn {
  const { t } = useI18n()

  const stableBackup = ref(false)
  const lazerBackup = ref(false)
  const backupOnlineIds = ref(true)
  const backupLocalBeatmaps = ref(false)
  const backupByCollection = ref(false)
  const mergeCollectionNames = ref(true)
  const isExporting = ref(false)
  const localExportProgress = ref<LocalExportProgress>({
    current: 0,
    total: 0,
    percent: 0,
    currentBeatmap: ''
  })
  let unsubscribeLocalExportProgress: (() => void) | null = null

  const isSyncing = ref(false)
  const isLoadingCollections = ref(false)
  const syncCooldownUntil = ref(0)
  const nowMs = ref(Date.now())
  let cooldownTicker: ReturnType<typeof setInterval> | null = null
  const statusMessage = ref('')
  const isSuccess = ref(false)
  const collections = ref<CollectionItem[]>([])
  const selectedCollectionKeys = ref<string[]>([])
  const collectionReadErrors = ref<{ stable?: string; lazer?: string }>({})
  const sortKey = ref<'name' | 'maps' | 'source'>('name')
  const sortDir = ref<'asc' | 'desc'>('asc')
  const syncStatus = ref({
    pending: 0,
    resolved: 0,
    notFound: 0,
    failed: 0,
    missingLocal: 0
  })
  const isEstimating = ref(false)
  const estimateMessage = ref('')
  const estimateError = ref(false)

  const previewCache = new Map<string, PreviewCacheEntry>()
  let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let estimateDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let previewRequestSeq = 0
  let latestPreviewAppliedSeq = 0

  const isSourceSelected = computed(() => stableBackup.value || lazerBackup.value)

  const canExportLocalBeatmaps = computed(
    () => backupLocalBeatmaps.value && (stableBackup.value || lazerBackup.value)
  )
  const isBackupContentSelected = computed(
    () => backupOnlineIds.value || canExportLocalBeatmaps.value
  )
  const canUseCollectionBackup = computed(() => isSourceSelected.value && backupOnlineIds.value)
  const canExport = computed(() => {
    if (!isSourceSelected.value) return false
    if (!isBackupContentSelected.value) return false
    if (!backupByCollection.value) return true
    return selectedCollectionKeys.value.length > 0
  })
  const allCollectionsSelected = computed(
    () =>
      collections.value.length > 0 &&
      selectedCollectionKeys.value.length === collections.value.length
  )
  const isCollectionSelectionIndeterminate = computed(
    () =>
      selectedCollectionKeys.value.length > 0 &&
      selectedCollectionKeys.value.length < collections.value.length
  )
  const sortedCollections = computed(() => {
    const items = [...collections.value]
    const direction = sortDir.value === 'asc' ? 1 : -1
    items.sort((a, b) => {
      if (sortKey.value === 'maps') {
        return (a.mapCount - b.mapCount) * direction
      }
      if (sortKey.value === 'source') {
        return a.source.localeCompare(b.source) * direction
      }
      return a.name.localeCompare(b.name) * direction
    })
    return items
  })
  const syncCooldownRemainingSeconds = computed(() => {
    const remainMs = syncCooldownUntil.value - nowMs.value
    return remainMs > 0 ? Math.ceil(remainMs / 1000) : 0
  })
  const isSyncCoolingDown = computed(() => syncCooldownRemainingSeconds.value > 0)
  const canTriggerSync = computed(() => !isSyncing.value && !isSyncCoolingDown.value)

  const mergeMode = computed<'merge' | 'split'>(() =>
    mergeCollectionNames.value ? 'merge' : 'split'
  )

  const ensureToggleRules = (): void => {
    if (!canUseCollectionBackup.value) {
      backupByCollection.value = false
    }
  }

  const saveToggleState = (): void => {
    const state: BackupToggleState = {
      stableBackup: stableBackup.value,
      lazerBackup: lazerBackup.value,
      backupOnlineIds: backupOnlineIds.value,
      backupLocalBeatmaps: backupLocalBeatmaps.value,
      backupByCollection: backupByCollection.value,
      mergeCollectionNames: mergeCollectionNames.value
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }

  const loadToggleState = (): void => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<BackupToggleState>
      stableBackup.value = Boolean(parsed.stableBackup)
      lazerBackup.value = Boolean(parsed.lazerBackup)
      backupOnlineIds.value =
        typeof parsed.backupOnlineIds === 'boolean' ? parsed.backupOnlineIds : true
      backupLocalBeatmaps.value = Boolean(parsed.backupLocalBeatmaps)
      backupByCollection.value = Boolean(parsed.backupByCollection)
      mergeCollectionNames.value =
        typeof parsed.mergeCollectionNames === 'boolean' ? parsed.mergeCollectionNames : true
      ensureToggleRules()
    } catch {
      // Ignore invalid persisted data.
    }
  }

  const buildPreviewCacheKey = (): string =>
    `${stableBackup.value ? '1' : '0'}:${lazerBackup.value ? '1' : '0'}:${mergeMode.value}`

  const applyPreviewResult = (
    nextCollections: CollectionItem[],
    nextSyncStatus: typeof syncStatus.value
  ): void => {
    collections.value = nextCollections
    syncStatus.value = nextSyncStatus
    const keys = new Set(collections.value.map((item) => item.key))
    selectedCollectionKeys.value = selectedCollectionKeys.value.filter((key) => keys.has(key))
    if (selectedCollectionKeys.value.length === 0) {
      selectedCollectionKeys.value = collections.value.map((item) => item.key)
    }
  }

  const savePreviewSnapshot = (
    cacheKey: string,
    nextCollections: CollectionItem[],
    nextSyncStatus: typeof syncStatus.value
  ): void => {
    const snapshot: PreviewSnapshot = {
      cacheKey,
      at: Date.now(),
      collections: nextCollections,
      syncStatus: nextSyncStatus
    }
    localStorage.setItem(PREVIEW_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  }

  const loadPreviewSnapshot = (): void => {
    if (!backupByCollection.value || !isSourceSelected.value) return

    try {
      const raw = localStorage.getItem(PREVIEW_SNAPSHOT_STORAGE_KEY)
      if (!raw) return
      const snapshot = JSON.parse(raw) as PreviewSnapshot
      const currentKey = buildPreviewCacheKey()
      if (snapshot.cacheKey !== currentKey) return
      applyPreviewResult(snapshot.collections, snapshot.syncStatus)
      previewCache.set(currentKey, {
        at: snapshot.at,
        collections: snapshot.collections,
        syncStatus: snapshot.syncStatus
      })
    } catch {
      // Ignore malformed snapshot payload.
    }
  }

  const loadCollectionPreview = async (options?: {
    forceRefresh?: boolean
    minLoadingMs?: number
  }): Promise<void> => {
    if (!backupByCollection.value || !isSourceSelected.value) {
      collections.value = []
      selectedCollectionKeys.value = []
      collectionReadErrors.value = {}
      previewCache.clear()
      return
    }

    const cacheKey = buildPreviewCacheKey()
    if (!options?.forceRefresh) {
      const cached = previewCache.get(cacheKey)
      if (cached && Date.now() - cached.at < PREVIEW_CACHE_TTL_MS) {
        applyPreviewResult(cached.collections, cached.syncStatus)
        return
      }
    }

    const requestSeq = ++previewRequestSeq
    isLoadingCollections.value = true
    const startTime = performance.now()
    const minLoadingMs = options?.minLoadingMs ?? 400

    try {
      const response = await window.electronAPI.backup.previewCollections({
        stable: stableBackup.value,
        lazer: lazerBackup.value,
        mergeMode: mergeMode.value
      })

      if (!response.success) {
        throw new Error(response.error || t('backup.error'))
      }

      if (requestSeq < latestPreviewAppliedSeq) {
        return
      }

      if (minLoadingMs > 0) {
        const elapsed = performance.now() - startTime
        if (elapsed < minLoadingMs) {
          await new Promise((resolve) => setTimeout(resolve, minLoadingMs - elapsed))
        }
        if (requestSeq < latestPreviewAppliedSeq) {
          return
        }
      }

      latestPreviewAppliedSeq = requestSeq
      collectionReadErrors.value = response.errors ?? {}
      applyPreviewResult(response.collections, response.syncStatus)
      previewCache.set(cacheKey, {
        at: Date.now(),
        collections: response.collections,
        syncStatus: response.syncStatus
      })
      savePreviewSnapshot(cacheKey, response.collections, response.syncStatus)
      void refreshEstimate()
    } finally {
      if (requestSeq >= latestPreviewAppliedSeq) {
        isLoadingCollections.value = false
      }
    }
  }

  const scheduleCollectionPreviewLoad = (options?: {
    forceRefresh?: boolean
    immediate?: boolean
    minLoadingMs?: number
  }): void => {
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer)
      previewDebounceTimer = null
    }
    const run = (): void => {
      void loadCollectionPreview({
        forceRefresh: options?.forceRefresh,
        minLoadingMs: options?.minLoadingMs
      })
    }
    if (options?.immediate) {
      run()
      return
    }
    previewDebounceTimer = setTimeout(run, PREVIEW_DEBOUNCE_MS)
  }

  const scheduleRefreshEstimate = (): void => {
    if (estimateDebounceTimer) {
      clearTimeout(estimateDebounceTimer)
    }
    estimateDebounceTimer = setTimeout(() => {
      estimateDebounceTimer = null
      void refreshEstimate()
    }, PREVIEW_DEBOUNCE_MS)
  }

  const formatBytes = (bytes: number): string => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    return `${(bytes / Math.pow(1024, exp)).toFixed(exp === 0 ? 0 : 2)} ${units[exp]}`
  }

  const refreshEstimate = async (): Promise<void> => {
    if (!isSourceSelected.value || !isBackupContentSelected.value) {
      estimateMessage.value = ''
      estimateError.value = false
      return
    }

    isEstimating.value = true
    estimateError.value = false
    try {
      const payload = await window.electronAPI.backup.estimate({
        stable: stableBackup.value,
        lazer: lazerBackup.value,
        backupOnlineIds: backupOnlineIds.value,
        backupLocalBeatmaps: backupLocalBeatmaps.value,
        backupByCollection: backupByCollection.value,
        collectionMergeMode: mergeMode.value,
        selectedCollections: [...selectedCollectionKeys.value]
      })
      const estimateParts: string[] = []
      if (backupOnlineIds.value) {
        estimateParts.push(
          t('backup.onlineEstimate', {
            count: payload.count,
            size: formatBytes(payload.estimatedBytes)
          })
        )
      }
      if (backupLocalBeatmaps.value && payload.localCount != null) {
        estimateParts.push(t('backup.localEstimate', { count: payload.localCount }))
      }
      estimateMessage.value =
        estimateParts.length > 0
          ? t('backup.estimatePrefix', { details: estimateParts.join(' · ') })
          : ''
    } catch (error) {
      estimateError.value = true
      estimateMessage.value =
        error instanceof Error ? error.message : t('backup.estimateUnavailable')
    } finally {
      isEstimating.value = false
    }
  }

  const updateCooldownTicker = (): void => {
    if (syncCooldownUntil.value > Date.now()) {
      if (!cooldownTicker) {
        cooldownTicker = setInterval(() => {
          nowMs.value = Date.now()
          if (nowMs.value >= syncCooldownUntil.value) {
            if (cooldownTicker) {
              clearInterval(cooldownTicker)
              cooldownTicker = null
            }
          }
        }, 500)
      }
    } else {
      if (cooldownTicker) {
        clearInterval(cooldownTicker)
        cooldownTicker = null
      }
    }
  }

  const syncMissingNow = async (): Promise<void> => {
    if (!canTriggerSync.value) return
    try {
      isSyncing.value = true
      const syncResponse = await window.electronAPI.database.syncCollections()
      if (!syncResponse.success) {
        throw new Error(syncResponse.error || t('backup.error'))
      }
      if (syncResponse.reason === 'cooldown' && typeof syncResponse.retryAfterMs === 'number') {
        syncCooldownUntil.value = Date.now() + syncResponse.retryAfterMs
      } else {
        syncCooldownUntil.value = Date.now() + 5_000
      }
      updateCooldownTicker()
      if (syncResponse.status) {
        syncStatus.value = syncResponse.status
      }
      await loadCollectionPreview({ forceRefresh: true, minLoadingMs: 400 })
    } catch (error) {
      console.error(error)
    } finally {
      isSyncing.value = false
    }
  }

  const toggleSelectAllCollections = (value: boolean | null): void => {
    selectedCollectionKeys.value = value ? collections.value.map((item) => item.key) : []
  }

  const setSort = (key: 'name' | 'maps' | 'source'): void => {
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
      return
    }
    sortKey.value = key
    sortDir.value = 'asc'
  }

  const getSortIndicator = (key: 'name' | 'maps' | 'source'): string => {
    if (sortKey.value !== key) return ''
    return sortDir.value === 'asc' ? '▲' : '▼'
  }

  const getSourceLabel = (source: CollectionItem['source']): string => {
    if (source === 'stable') return t('backup.collection.sources.stable')
    if (source === 'lazer') return t('backup.collection.sources.lazer')
    return t('backup.collection.sources.both')
  }

  watch(
    () => [
      stableBackup.value,
      lazerBackup.value,
      backupOnlineIds.value,
      backupLocalBeatmaps.value,
      backupByCollection.value,
      mergeCollectionNames.value
    ],
    () => {
      saveToggleState()
    }
  )

  watch(
    () => [
      stableBackup.value,
      lazerBackup.value,
      backupOnlineIds.value,
      backupLocalBeatmaps.value,
      backupByCollection.value,
      mergeCollectionNames.value,
      selectedCollectionKeys.value.length
    ],
    () => {
      scheduleRefreshEstimate()
    }
  )

  watch(
    () => [stableBackup.value, lazerBackup.value, backupByCollection.value, mergeMode.value],
    ([stable, lazer, byCollection], [oldStable, oldLazer]) => {
      if (!isSourceSelected.value || stable !== oldStable || lazer !== oldLazer) {
        collections.value = []
        selectedCollectionKeys.value = []
      }
      if (!byCollection || !isSourceSelected.value) {
        return
      }
      scheduleCollectionPreviewLoad({
        immediate: collections.value.length === 0,
        minLoadingMs: collections.value.length === 0 ? 0 : 400
      })
    }
  )

  const handleExport = async (): Promise<void> => {
    if (!canExport.value) return

    try {
      isExporting.value = true
      statusMessage.value = ''
      localExportProgress.value = { current: 0, total: 0, percent: 0, currentBeatmap: '' }

      const response = await window.electronAPI.backup.export({
        stable: stableBackup.value,
        lazer: lazerBackup.value,
        backupOnlineIds: backupOnlineIds.value,
        backupLocalBeatmaps: backupLocalBeatmaps.value,
        backupByCollection: backupByCollection.value,
        collectionMergeMode: mergeMode.value,
        selectedCollections: [...selectedCollectionKeys.value]
      })

      if (!response?.success) {
        if (response?.error === 'cancelled') {
          throw new Error('cancelled')
        }
        throw new Error(response?.error || t('backup.error'))
      }

      isSuccess.value = true
      const onlineSuccessMessage =
        backupByCollection.value && response.stats
          ? t('backup.collection.successStats', {
              count: response.count,
              pending: response.stats.pendingSync,
              missing: response.stats.missingLocal,
              notFound: response.stats.apiNotFound
            })
          : t('backup.success', { count: response.count })
      let localMessage = ''
      if (response.local && response.localLazer) {
        localMessage = t('backup.combinedLocalSuccess', {
          stable: response.local.count,
          lazer: response.localLazer.count
        })
      } else if (response.local) {
        localMessage = t('backup.localSuccess', {
          count: response.local.count,
          source: t('backup.collection.sources.stable')
        })
      } else if (response.localLazer) {
        localMessage = t('backup.localSuccess', {
          count: response.localLazer.count,
          source: t('backup.collection.sources.lazer')
        })
      }
      const messageParts: string[] = []
      if (backupOnlineIds.value) messageParts.push(onlineSuccessMessage)
      if (localMessage) messageParts.push(localMessage)
      statusMessage.value = messageParts.join('. ')
    } catch (error: unknown) {
      isSuccess.value = false
      const msg = error instanceof Error ? error.message : t('backup.error')
      statusMessage.value = msg === 'cancelled' ? t('backup.cancelled') : msg
    } finally {
      isExporting.value = false
      localExportProgress.value = { current: 0, total: 0, percent: 0, currentBeatmap: '' }
    }
  }

  const initialize = (): void => {
    loadToggleState()
    loadPreviewSnapshot()
    if (backupByCollection.value && isSourceSelected.value) {
      scheduleCollectionPreviewLoad({ immediate: true, minLoadingMs: 0 })
    }
    scheduleRefreshEstimate()
    updateCooldownTicker()
    unsubscribeLocalExportProgress = window.electronAPI.backup.onLocalExportProgress((progress) => {
      localExportProgress.value = progress
    })
  }

  const teardown = (): void => {
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer)
      previewDebounceTimer = null
    }
    if (estimateDebounceTimer) {
      clearTimeout(estimateDebounceTimer)
      estimateDebounceTimer = null
    }
    if (cooldownTicker) {
      clearInterval(cooldownTicker)
      cooldownTicker = null
    }
    if (unsubscribeLocalExportProgress) {
      unsubscribeLocalExportProgress()
      unsubscribeLocalExportProgress = null
    }
  }

  return {
    stableBackup,
    lazerBackup,
    backupOnlineIds,
    backupLocalBeatmaps,
    backupByCollection,
    mergeCollectionNames,
    isExporting,
    localExportProgress,
    isSyncing,
    isLoadingCollections,
    statusMessage,
    isSuccess,
    collections,
    selectedCollectionKeys,
    collectionReadErrors,
    sortKey,
    syncStatus,
    isEstimating,
    estimateMessage,
    estimateError,
    canUseCollectionBackup,
    canExport,
    allCollectionsSelected,
    isCollectionSelectionIndeterminate,
    sortedCollections,
    syncCooldownRemainingSeconds,
    isSyncCoolingDown,
    canTriggerSync,
    setSort,
    getSortIndicator,
    getSourceLabel,
    toggleSelectAllCollections,
    syncMissingNow,
    handleExport,
    initialize,
    teardown
  }
}
