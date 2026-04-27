<template>
  <AppViewShell :title="$t('backup.title')" :lang="currentLocale">
    <AppIsland>
      <AppForm>
        <v-switch
          v-model="stableBackup"
          :label="$t('backup.stableBackup')"
          :lang="currentLocale"
          class="view-field"
          color="primary"
          hide-details
        ></v-switch>
        <v-switch
          v-model="lazerBackup"
          :label="$t('backup.lazerBackup')"
          :lang="currentLocale"
          class="view-field"
          color="primary"
          hide-details
        ></v-switch>
        <v-switch
          v-model="backupByCollection"
          :label="$t('backup.collection.enabled')"
          :lang="currentLocale"
          class="view-field"
          color="primary"
          hide-details
          :disabled="!isSourceSelected"
        ></v-switch>

        <template v-if="backupByCollection">
          <v-switch
            v-model="mergeCollectionNames"
            :label="$t('backup.collection.mergeByName')"
            :lang="currentLocale"
            class="view-field"
            color="primary"
            hide-details
          ></v-switch>
          <div class="text-caption mb-2" :lang="currentLocale">
            <span class="status-resolved">{{ $t('backup.collection.status.resolved') }} {{ syncStatus.resolved }}</span>
            <span class="mx-2">·</span>
            <span class="status-pending">{{ $t('backup.collection.status.pending') }} {{ syncStatus.pending }}</span>
            <span class="mx-2">·</span>
            <span class="status-not-found">{{ $t('backup.collection.status.notFound') }} {{ syncStatus.notFound }}</span>
            <span class="mx-2">·</span>
            <span class="status-missing">{{ $t('backup.collection.status.missingLocal') }} {{ syncStatus.missingLocal }}</span>
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
        </template>

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

const STORAGE_KEY = 'backup.toggle.state.v1'
const PREVIEW_SNAPSHOT_STORAGE_KEY = 'backup.collection.preview.snapshot.v1'
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
const canExport = computed(() => {
  if (!isSourceSelected.value) return false
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
  if (!stableBackup.value && !lazerBackup.value) {
    backupByCollection.value = false
  }
}

const saveToggleState = (): void => {
  const state: BackupToggleState = {
    stableBackup: stableBackup.value,
    lazerBackup: lazerBackup.value,
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

const applyPreviewResult = (nextCollections: CollectionItem[], nextSyncStatus: typeof syncStatus.value): void => {
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
}

const scheduleCollectionPreviewLoad = (options?: { forceRefresh?: boolean; immediate?: boolean }): void => {
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
    statusMessage.value =
      backupByCollection.value && response.stats
        ? t('backup.collection.successStats', {
            count: response.count,
            pending: response.stats.pendingSync,
            missing: response.stats.missingLocal,
            notFound: response.stats.apiNotFound
          })
        : t('backup.success', { count: response.count })
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
