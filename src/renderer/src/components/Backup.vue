<template>
  <AppViewShell :title="$t('backup.title')" :lang="currentLocale">
    <AppIsland :title="$t('backup.backupBeatmapTitle')" icon="$contentSaveOutline">
      <AppForm>
        <!-- 1. Sources & Content Options -->
        <BackupSourcesCard
          v-model:model-value-stable="stableBackup"
          v-model:model-value-lazer="lazerBackup"
          v-model:model-value-online-ids="backupOnlineIds"
          v-model:model-value-local-beatmaps="backupLocalBeatmaps"
          :current-locale="currentLocale"
        />

        <v-divider class="backup-divider"></v-divider>

        <!-- 2. Collections & Scope -->
        <BackupCollectionsCard
          v-model:model-value-backup-by-collection="backupByCollection"
          v-model:model-value-merge-collection-names="mergeCollectionNames"
          v-model:model-value-selected-collection-keys="selectedCollectionKeys"
          :can-use-collection-backup="canUseCollectionBackup"
          :collection-read-errors="collectionReadErrors"
          :sync-status="syncStatus"
          :is-syncing="isSyncing"
          :is-loading="isLoadingCollections"
          :can-trigger-sync="canTriggerSync"
          :is-sync-cooling-down="isSyncCoolingDown"
          :sync-cooldown-remaining-seconds="syncCooldownRemainingSeconds"
          :collections="collections"
          :all-collections-selected="allCollectionsSelected"
          :is-collection-selection-indeterminate="isCollectionSelectionIndeterminate"
          :sort-key="sortKey"
          :get-sort-indicator="getSortIndicator"
          :get-source-label="getSourceLabel"
          :sorted-collections="sortedCollections"
          :current-locale="currentLocale"
          @toggle-select-all="toggleSelectAllCollections"
          @set-sort="setSort"
          @sync-missing="syncMissingNow"
        />

        <!-- 3. Export Action & Progress -->
        <BackupActionCard
          :estimate-message="estimateMessage"
          :estimate-error="estimateError"
          :is-estimating="isEstimating"
          :can-export="canExport"
          :is-exporting="isExporting"
          :backup-local-beatmaps="backupLocalBeatmaps"
          :local-export-progress="localExportProgress"
          :status-message="statusMessage"
          :is-success="isSuccess"
          :current-locale="currentLocale"
          @export="handleExport"
        />
      </AppForm>
    </AppIsland>
  </AppViewShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import AppForm from './common/AppForm.vue'
import BackupSourcesCard from './backup/BackupSourcesCard.vue'
import BackupCollectionsCard from './backup/BackupCollectionsCard.vue'
import BackupActionCard from './backup/BackupActionCard.vue'
import { useBackupWorkflow } from '../composables/useBackupWorkflow'

const { locale } = useI18n()
const currentLocale = computed(() => locale.value)

const {
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
} = useBackupWorkflow()

onMounted(() => {
  initialize()
})

onBeforeUnmount(() => {
  teardown()
})
</script>

<style scoped>
.backup-divider {
  border-color: var(--card-border-color) !important;
  opacity: 0.6;
  margin: -6px 0 !important;
}
</style>
