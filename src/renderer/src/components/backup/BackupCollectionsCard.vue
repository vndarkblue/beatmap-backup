<template>
  <div class="backup-collections-container">
    <!-- Error alerts -->
    <v-alert
      v-if="backupByCollection && collectionReadErrors.stable"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
      :lang="currentLocale"
    >
      {{
        $t('backup.collection.errors.stableReadFailed', {
          error: collectionReadErrors.stable
        })
      }}
    </v-alert>
    <v-alert
      v-if="backupByCollection && collectionReadErrors.lazer"
      type="warning"
      variant="tonal"
      density="compact"
      class="mb-3"
      :lang="currentLocale"
    >
      {{ $t('backup.collection.errors.lazerReadFailed', { error: collectionReadErrors.lazer }) }}
    </v-alert>

    <!-- Controls Panel -->
    <div class="collection-controls-panel" :class="{ 'mb-3': backupByCollection }">
      <!-- Row 1: Main Scope Switch (Left) + Status Metrics (Right) -->
      <div
        class="d-flex flex-column flex-sm-row justify-space-between align-start align-sm-center ga-2"
      >
        <v-switch
          v-model="backupByCollection"
          :label="$t('backup.collection.enabled')"
          :lang="currentLocale"
          class="view-field pl-2 main-collection-switch"
          color="primary"
          density="compact"
          hide-details
          :disabled="!canUseCollectionBackup"
        ></v-switch>

        <div
          v-if="backupByCollection"
          class="text-caption text-sm-right collection-status-text"
          :lang="currentLocale"
        >
          <span class="status-resolved"
            >{{ $t('backup.collection.status.resolved') }} {{ syncStatus.resolved }}</span
          >
          <span class="mx-1">·</span>
          <span class="status-pending"
            >{{ $t('backup.collection.status.pending') }} {{ syncStatus.pending }}</span
          >
          <span class="mx-1">·</span>
          <span class="status-not-found"
            >{{ $t('backup.collection.status.notFound') }} {{ syncStatus.notFound }}</span
          >
          <span class="mx-1">·</span>
          <span class="status-missing"
            >{{ $t('backup.collection.status.missingLocal') }} {{ syncStatus.missingLocal }}</span
          >
        </div>
      </div>

      <!-- Row 2: Sub-option (Left) + Sync Button (Right) -->
      <div
        v-if="backupByCollection"
        class="d-flex flex-column flex-sm-row justify-space-between align-start align-sm-center ga-2 mt-1"
      >
        <div class="collection-sub-option">
          <v-switch
            v-model="mergeCollectionNames"
            :label="$t('backup.collection.mergeByName')"
            :lang="currentLocale"
            class="view-field pl-2 sub-collection-switch"
            color="primary"
            density="compact"
            hide-details
          ></v-switch>
        </div>

        <v-btn
          variant="tonal"
          color="info"
          size="small"
          class="view-field sync-action-btn"
          :loading="isSyncing"
          :disabled="!canTriggerSync"
          @click="$emit('sync-missing')"
        >
          {{
            isSyncCoolingDown
              ? `${$t('backup.collection.syncNow')} (${syncCooldownRemainingSeconds}${$t('backup.collection.secondsShort')})`
              : $t('backup.collection.syncNow')
          }}
        </v-btn>
      </div>
    </div>

    <!-- Collections Table -->
    <template v-if="backupByCollection">
      <v-card v-if="collections.length > 0" variant="outlined" class="collection-table-card">
        <SimpleBar class="collection-table-scroll">
          <v-table density="compact" class="collection-table">
            <thead>
              <tr>
                <th class="checkbox-col">
                  <v-checkbox
                    :model-value="allCollectionsSelected"
                    :indeterminate="isCollectionSelectionIndeterminate"
                    hide-details
                    density="compact"
                    @update:model-value="(val) => $emit('toggle-select-all', val)"
                  />
                </th>
                <th class="sortable-col" @click="$emit('set-sort', 'name')">
                  {{ $t('backup.collection.table.name') }}
                  <span v-if="sortKey === 'name'" class="sort-indicator active">{{
                    getSortIndicator('name')
                  }}</span>
                </th>
                <th class="sortable-col" @click="$emit('set-sort', 'maps')">
                  {{ $t('backup.collection.table.maps') }}
                  <span v-if="sortKey === 'maps'" class="sort-indicator active">{{
                    getSortIndicator('maps')
                  }}</span>
                </th>
                <th class="sortable-col" @click="$emit('set-sort', 'source')">
                  {{ $t('backup.collection.table.source') }}
                  <span v-if="sortKey === 'source'" class="sort-indicator active">{{
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
                    v-model="selectedKeys"
                    :value="item.key"
                    hide-details
                    density="compact"
                  />
                </td>
                <td class="font-weight-medium">{{ item.name }}</td>
                <td>{{ item.mapCount }}</td>
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
      <div v-else class="text-caption text-medium-emphasis" :lang="currentLocale">
        {{ $t('backup.collection.empty') }}
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SimpleBar from 'simplebar-vue'
import 'simplebar-vue/dist/simplebar.min.css'

export interface CollectionItem {
  key: string
  name: string
  source: 'stable' | 'lazer' | 'both'
  mapCount: number
  resolvedCount: number
  pendingCount: number
  apiNotFoundCount: number
  missingLocalCount: number
}

const props = defineProps<{
  modelValueBackupByCollection: boolean
  canUseCollectionBackup: boolean
  collectionReadErrors: { stable?: string; lazer?: string }
  modelValueMergeCollectionNames: boolean
  syncStatus: { resolved: number; pending: number; notFound: number; missingLocal: number }
  isSyncing: boolean
  canTriggerSync: boolean
  isSyncCoolingDown: boolean
  syncCooldownRemainingSeconds: number
  collections: CollectionItem[]
  allCollectionsSelected: boolean
  isCollectionSelectionIndeterminate: boolean
  sortKey: string
  getSortIndicator: (col: 'name' | 'maps' | 'source') => string
  getSourceLabel: (source: 'stable' | 'lazer' | 'both') => string
  sortedCollections: CollectionItem[]
  modelValueSelectedCollectionKeys: string[]
  currentLocale: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValueBackupByCollection', val: boolean): void
  (e: 'update:modelValueMergeCollectionNames', val: boolean): void
  (e: 'update:modelValueSelectedCollectionKeys', val: string[]): void
  (e: 'toggle-select-all', val: boolean | null): void
  (e: 'set-sort', key: 'name' | 'maps' | 'source'): void
  (e: 'sync-missing'): void
}>()

const backupByCollection = computed({
  get: () => props.modelValueBackupByCollection,
  set: (val: boolean) => emit('update:modelValueBackupByCollection', val)
})

const mergeCollectionNames = computed({
  get: () => props.modelValueMergeCollectionNames,
  set: (val: boolean) => emit('update:modelValueMergeCollectionNames', val)
})

const selectedKeys = computed({
  get: () => props.modelValueSelectedCollectionKeys,
  set: (val: string[]) => emit('update:modelValueSelectedCollectionKeys', val)
})
</script>

<style scoped>
.collection-sub-option {
  margin-left: 28px;
}

.sub-collection-switch :deep(.v-label) {
  font-size: 0.875rem !important;
  opacity: 0.9;
}

.sync-action-btn {
  font-weight: 600 !important;
  letter-spacing: 0.3px;
  border-radius: 8px !important;
}

.collection-table-card {
  border-radius: 12px !important;
  border-color: var(--card-border-color) !important;
  background: rgba(127, 127, 127, 0.03) !important;
  overflow: hidden;
}

.collection-table-card :deep(.v-table__wrapper) {
  overflow: visible !important;
}

.collection-table-card :deep(.v-table__wrapper > table) {
  border-collapse: collapse;
}

.collection-table-scroll {
  max-height: 280px;
  max-width: 100%;
}

.collection-table-scroll :deep(.simplebar-content-wrapper) {
  overflow: auto !important;
}

.collection-table-scroll :deep(.simplebar-track.simplebar-horizontal) {
  height: 6px;
}

.collection-table-card :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: color-mix(
    in srgb,
    var(--main-text-color) 7%,
    rgb(var(--v-theme-surface))
  ) !important;
  box-shadow: inset 0 -1px 0 rgba(var(--v-theme-on-surface), 0.14);
  font-weight: 700 !important;
  color: var(--main-text-color) !important;
  user-select: none;
}

.collection-table-card :deep(tbody td) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1) !important;
}

.collection-table-card :deep(tbody tr:last-child td) {
  border-bottom: none !important;
}

.checkbox-col {
  width: 48px;
  text-align: center;
}

.sortable-col {
  cursor: pointer;
}

.sortable-col:hover {
  color: var(--accent-pink) !important;
}

.sort-indicator {
  display: inline-block;
  margin-left: 4px;
}

.sort-indicator.active {
  color: var(--accent-pink);
}

.status-resolved {
  color: var(--accent-green, #10b981);
  font-weight: 600;
}

.status-pending {
  color: #f59e0b;
  font-weight: 600;
}

.status-not-found {
  color: var(--text-muted-color);
}

.status-missing {
  color: #ef4444;
  font-weight: 600;
}
</style>
