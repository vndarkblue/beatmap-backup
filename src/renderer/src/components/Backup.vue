<template>
  <AppViewShell :title="$t('backup.title')" :lang="currentLocale">
    <AppIsland :title="$t('backup.backupBeatmapTitle')" icon="mdi-content-save-outline">
      <AppForm>
        <div class="backup-controls">
          <div class="d-flex flex-column flex-sm-row backup-options-row">
            <div class="flex-grow-1 pr-sm-4 mb-4 mb-sm-0">
              <div class="text-subtitle-1 mb-3 mt-1" :lang="currentLocale">
                {{ $t('backup.sources.title') }}
              </div>
              <v-switch
                v-model="stableBackup"
                :label="$t('backup.stableBackup')"
                :lang="currentLocale"
                class="view-field pl-2"
                color="primary"
                hide-details
              ></v-switch>
              <v-switch
                v-model="lazerBackup"
                :label="$t('backup.lazerBackup')"
                :lang="currentLocale"
                class="view-field pl-2"
                color="primary"
                hide-details
              ></v-switch>
            </div>

            <v-divider vertical class="mx-4 d-none d-sm-flex"></v-divider>

            <div class="flex-grow-1">
              <div class="text-subtitle-1 mb-3 mt-1" :lang="currentLocale">
                {{ $t('backup.content.title') }}
              </div>
              <v-switch
                v-model="backupOnlineIds"
                :label="$t('backup.content.onlineIds')"
                :lang="currentLocale"
                class="view-field pl-2"
                color="primary"
                hide-details
              ></v-switch>
              <v-switch
                v-model="backupLocalBeatmaps"
                :label="$t('backup.content.localBeatmaps')"
                :lang="currentLocale"
                class="view-field pl-2"
                color="primary"
                hide-details
              ></v-switch>
            </div>
          </div>

          <v-alert
            v-if="backupLocalBeatmaps"
            type="info"
            variant="tonal"
            density="compact"
            class="local-backup-alert"
            :lang="currentLocale"
          >
            {{ $t('backup.content.localBeatmapsPending') }}
          </v-alert>

          <div class="backup-scope">
            <v-switch
              v-model="backupByCollection"
              :label="$t('backup.collection.enabled')"
              :lang="currentLocale"
              class="view-field pl-2"
              color="primary"
              hide-details
              :disabled="!canUseCollectionBackup"
            ></v-switch>
          </div>
        </div>

        <div v-if="backupByCollection" class="collection-options">
          <v-switch
            v-model="mergeCollectionNames"
            :label="$t('backup.collection.mergeByName')"
            :lang="currentLocale"
            class="view-field pl-2"
            color="primary"
            hide-details
          ></v-switch>
          <div class="text-caption mb-2" :lang="currentLocale">
            <span class="status-resolved"
              >{{ $t('backup.collection.status.resolved') }} {{ syncStatus.resolved }}</span
            >
            <span class="mx-2">·</span>
            <span class="status-pending"
              >{{ $t('backup.collection.status.pending') }} {{ syncStatus.pending }}</span
            >
            <span class="mx-2">·</span>
            <span class="status-not-found"
              >{{ $t('backup.collection.status.notFound') }} {{ syncStatus.notFound }}</span
            >
            <span class="mx-2">·</span>
            <span class="status-missing"
              >{{ $t('backup.collection.status.missingLocal') }} {{ syncStatus.missingLocal }}</span
            >
          </div>
          <v-btn
            variant="tonal"
            color="info"
            class="view-field sync-action-btn"
            :loading="isSyncing"
            :disabled="!canTriggerSync"
            @click="syncMissingNow"
          >
            {{
              isSyncCoolingDown
                ? `${$t('backup.collection.syncNow')} (${syncCooldownRemainingSeconds}${$t('backup.collection.secondsShort')})`
                : $t('backup.collection.syncNow')
            }}
          </v-btn>
          <v-card
            v-if="collections.length > 0"
            variant="outlined"
            class="mb-3 collection-table-card"
          >
            <SimpleBar class="collection-table-scroll" data-simplebar-auto-hide="false">
              <v-table density="compact">
                <thead>
                  <tr>
                    <th class="checkbox-col">
                      <v-checkbox
                        :model-value="allCollectionsSelected"
                        :indeterminate="isCollectionSelectionIndeterminate"
                        hide-details
                        density="compact"
                        @update:model-value="toggleSelectAllCollections"
                      />
                    </th>
                    <th class="sortable-col" @click="setSort('name')">
                      {{ $t('backup.collection.table.name') }}
                      <span class="sort-indicator" :class="{ active: sortKey === 'name' }">{{
                        getSortIndicator('name')
                      }}</span>
                    </th>
                    <th class="sortable-col" @click="setSort('maps')">
                      {{ $t('backup.collection.table.maps') }}
                      <span class="sort-indicator" :class="{ active: sortKey === 'maps' }">{{
                        getSortIndicator('maps')
                      }}</span>
                    </th>
                    <th class="sortable-col" @click="setSort('source')">
                      {{ $t('backup.collection.table.source') }}
                      <span class="sort-indicator" :class="{ active: sortKey === 'source' }">{{
                        getSortIndicator('source')
                      }}</span>
                    </th>
                    <th>{{ $t('backup.collection.table.status') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in sortedCollections" :key="item.key">
                    <td class="checkbox-col">
                      <v-checkbox
                        v-model="selectedCollectionKeys"
                        :value="item.key"
                        hide-details
                        density="compact"
                      />
                    </td>
                    <td>{{ item.name }}</td>
                    <td>
                      <span class="map-count">{{ item.mapCount }}</span>
                    </td>
                    <td>{{ getSourceLabel(item.source) }}</td>
                    <td>
                      <span class="status-resolved">{{ item.resolvedCount }}</span>
                      <span class="mx-2">·</span>
                      <span class="status-pending">{{ item.pendingCount }}</span>
                      <span class="mx-2">·</span>
                      <span class="status-not-found">{{ item.apiNotFoundCount }}</span>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </SimpleBar>
          </v-card>
          <div v-else class="text-caption mb-2" :lang="currentLocale">
            {{ $t('backup.collection.empty') }}
          </div>
        </div>

        <v-btn
          color="primary"
          block
          class="view-field"
          :lang="currentLocale"
          :disabled="!canExport"
          :loading="isExporting"
          @click="handleExport"
        >
          {{ $t('backup.button') }}
        </v-btn>
        <v-alert
          v-if="estimateMessage"
          :type="estimateError ? 'warning' : 'info'"
          variant="tonal"
          density="comfortable"
          class="mt-3"
        >
          {{ estimateMessage }}
        </v-alert>
        <v-progress-linear
          v-if="isEstimating"
          indeterminate
          color="primary"
          class="mt-2"
        ></v-progress-linear>
        <div
          v-if="statusMessage"
          class="text-center mt-2"
          :class="{ 'text-success': isSuccess, 'text-error': !isSuccess }"
        >
          {{ statusMessage }}
        </div>
      </AppForm>
    </AppIsland>
  </AppViewShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_ENDPOINTS } from '../../../config/sharedConstants'
import { HTTP_HEADERS, STORAGE_KEYS } from '../../../config/frontendConstants'
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import AppForm from './common/AppForm.vue'
import SimpleBar from 'simplebar-vue'
import 'simplebar-vue/dist/simplebar.min.css'

type CollectionItem = {
  key: string
  name: string
  source: 'stable' | 'lazer' | 'both'
  mapCount: number
  resolvedCount: number
  pendingCount: number
  apiNotFoundCount: number
  missingLocalCount: number
}

const { locale, t } = useI18n()
const currentLocale = computed(() => locale.value)

const stableBackup = ref(false)
const lazerBackup = ref(false)
const backupOnlineIds = ref(true)
const backupLocalBeatmaps = ref(false)
const backupByCollection = ref(false)
const mergeCollectionNames = ref(true)
const isExporting = ref(false)
const isSyncing = ref(false)
const syncCooldownUntil = ref(0)
const nowMs = ref(Date.now())
let cooldownTicker: ReturnType<typeof setInterval> | null = null
const statusMessage = ref('')
const isSuccess = ref(false)
const collections = ref<CollectionItem[]>([])
const selectedCollectionKeys = ref<string[]>([])
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

const STORAGE_KEY = STORAGE_KEYS.BACKUP_TOGGLE_STATE
const PREVIEW_SNAPSHOT_STORAGE_KEY = STORAGE_KEYS.BACKUP_COLLECTION_PREVIEW_SNAPSHOT
const PREVIEW_CACHE_TTL_MS = 3_000
const PREVIEW_DEBOUNCE_MS = 200

type PreviewCacheEntry = {
  at: number
  collections: CollectionItem[]
  syncStatus: typeof syncStatus.value
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
  syncStatus: typeof syncStatus.value
}

const previewCache = new Map<string, PreviewCacheEntry>()
let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null
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
    collections.value.length > 0 && selectedCollectionKeys.value.length === collections.value.length
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
  // If no source is enabled, backup-by-collection must be off before toggle gets disabled.
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

const loadCollectionPreview = async (options?: { forceRefresh?: boolean }): Promise<void> => {
  if (!backupByCollection.value || !isSourceSelected.value) {
    collections.value = []
    selectedCollectionKeys.value = []
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
  const response = await window.electronAPI.previewCollections({
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
  latestPreviewAppliedSeq = requestSeq
  applyPreviewResult(response.collections, response.syncStatus)
  previewCache.set(cacheKey, {
    at: Date.now(),
    collections: response.collections,
    syncStatus: response.syncStatus
  })
  savePreviewSnapshot(cacheKey, response.collections, response.syncStatus)
  void refreshEstimate()
}

const scheduleCollectionPreviewLoad = (options?: {
  forceRefresh?: boolean
  immediate?: boolean
}): void => {
  if (previewDebounceTimer) {
    clearTimeout(previewDebounceTimer)
    previewDebounceTimer = null
  }
  const run = (): void => {
    void loadCollectionPreview({ forceRefresh: options?.forceRefresh })
  }
  if (options?.immediate) {
    run()
    return
  }
  previewDebounceTimer = setTimeout(run, PREVIEW_DEBOUNCE_MS)
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
    const response = await fetch(API_ENDPOINTS.EXPORT_ESTIMATE, {
      method: 'POST',
      headers: HTTP_HEADERS.JSON,
      body: JSON.stringify({
        options: {
          stable: stableBackup.value,
          lazer: lazerBackup.value,
          backupOnlineIds: backupOnlineIds.value,
          backupLocalBeatmaps: backupLocalBeatmaps.value,
          backupByCollection: backupByCollection.value,
          collectionMergeMode: mergeMode.value,
          selectedCollections: [...selectedCollectionKeys.value]
        }
      })
    })
    const payload = await response.json()
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || 'Failed to estimate backup')
    }
    const estimateParts: string[] = []
    if (backupOnlineIds.value) {
      estimateParts.push(
        t('backup.estimate', { count: payload.count, size: formatBytes(payload.estimatedBytes) })
      )
    }
    if (backupLocalBeatmaps.value && payload.localCount != null) {
      estimateParts.push(t('backup.localEstimate', { count: payload.localCount }))
    }
    estimateMessage.value = estimateParts.join(' · ')
  } catch (error) {
    estimateError.value = true
    estimateMessage.value = error instanceof Error ? error.message : t('backup.estimateUnavailable')
  } finally {
    isEstimating.value = false
  }
}

const syncMissingNow = async (): Promise<void> => {
  if (!canTriggerSync.value) return
  try {
    isSyncing.value = true
    const syncResponse = await window.electronAPI.syncCollectionMd5Cache()
    if (!syncResponse.success) {
      throw new Error(syncResponse.error || t('backup.error'))
    }
    if (syncResponse.reason === 'cooldown' && typeof syncResponse.retryAfterMs === 'number') {
      syncCooldownUntil.value = Date.now() + syncResponse.retryAfterMs
    } else {
      syncCooldownUntil.value = Date.now() + 5_000
    }
    if (syncResponse.status) {
      syncStatus.value = syncResponse.status
    }
    await loadCollectionPreview({ forceRefresh: true })
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
  if (sortKey.value !== key) return '▲'
  return sortDir.value === 'asc' ? '▲' : '▼'
}

const getSourceLabel = (source: CollectionItem['source']): string => {
  if (source === 'stable') return t('backup.collection.sources.stable')
  if (source === 'lazer') return t('backup.collection.sources.lazer')
  return t('backup.collection.sources.both')
}

watch([stableBackup, lazerBackup, backupByCollection, mergeCollectionNames], () => {
  ensureToggleRules()
  saveToggleState()
  scheduleCollectionPreviewLoad()
  void refreshEstimate()
})

watch([backupOnlineIds, backupLocalBeatmaps], () => {
  ensureToggleRules()
  saveToggleState()
  scheduleCollectionPreviewLoad()
  void refreshEstimate()
})

watch(selectedCollectionKeys, () => {
  if (backupByCollection.value) {
    void refreshEstimate()
  }
})

onMounted(() => {
  cooldownTicker = setInterval(() => {
    nowMs.value = Date.now()
  }, 250)
  loadToggleState()
  ensureToggleRules()
  saveToggleState()
  loadPreviewSnapshot()
  scheduleCollectionPreviewLoad({ immediate: true })
  void refreshEstimate()
})

onBeforeUnmount(() => {
  if (previewDebounceTimer) {
    clearTimeout(previewDebounceTimer)
    previewDebounceTimer = null
  }
  if (cooldownTicker) {
    clearInterval(cooldownTicker)
    cooldownTicker = null
  }
})

const handleExport = async (): Promise<void> => {
  if (!canExport.value) return

  try {
    isExporting.value = true
    statusMessage.value = ''

    const response = await window.electronAPI.exportData({
      stable: stableBackup.value,
      lazer: lazerBackup.value,
      backupOnlineIds: backupOnlineIds.value,
      backupLocalBeatmaps: backupLocalBeatmaps.value,
      backupByCollection: backupByCollection.value,
      collectionMergeMode: mergeMode.value,
      // Vue reactive arrays are proxies; send a plain array for Electron IPC cloning.
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
      localMessage = t('backup.localSuccess', { count: response.local.count })
    } else if (response.localLazer) {
      localMessage = t('backup.lazerLocalSuccess', { count: response.localLazer.count })
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
  }
}
</script>

<style scoped>
.checkbox-col {
  width: 52px;
}

.map-count {
  font-weight: 400;
  color: rgb(var(--v-theme-on-surface));
}

.backup-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.backup-options-row {
  margin-bottom: 4px;
}

.backup-scope {
  margin-bottom: 0;
}

.local-backup-alert {
  margin-top: 2px;
  margin-bottom: 2px;
}

.collection-options {
  margin-top: -14px;
}

.collection-options > .v-switch {
  margin-bottom: 12px;
}

thead th {
  font-weight: 700 !important;
}

.sortable-col {
  cursor: pointer;
  user-select: none;
}

.sort-indicator {
  display: inline-block;
  width: 10px;
  font-size: 0.72rem;
  margin-left: 4px;
  opacity: 0;
}

.sort-indicator.active {
  opacity: 0.75;
}

.status-resolved {
  color: rgb(var(--v-theme-success));
  opacity: 0.9;
}

.status-pending {
  color: rgb(var(--v-theme-warning));
  opacity: 0.92;
}

.status-not-found {
  color: rgb(var(--v-theme-error));
  opacity: 0.85;
}

.status-failed {
  color: rgb(var(--v-theme-error));
  opacity: 0.7;
}

.status-missing {
  opacity: 0.72;
}

.sync-action-btn {
  font-weight: 600;
}

.collection-table-card {
  border-color: rgba(var(--v-theme-on-surface), 0.16) !important;
}

.collection-table-card :deep(.v-table__wrapper > table) {
  border-collapse: collapse;
}

.collection-table-card :deep(.v-table__wrapper) {
  overflow: visible !important;
}

.collection-table-card :deep(thead th),
.collection-table-card :deep(tbody td) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1) !important;
}

.collection-table-card :deep(tbody tr:last-child td) {
  border-bottom: none !important;
}

.collection-table-scroll {
  max-width: 100%;
}

.collection-table-scroll :deep(.simplebar-content-wrapper) {
  overflow: auto !important;
}

.collection-table-scroll :deep(.simplebar-track.simplebar-horizontal) {
  height: 6px;
}
</style>
