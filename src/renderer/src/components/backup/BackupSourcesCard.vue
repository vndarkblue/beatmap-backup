<template>
  <div class="backup-sources-card">
    <div class="d-flex flex-column flex-sm-row backup-options-row">
      <!-- Sources Column -->
      <div class="flex-grow-1 pr-sm-4 mb-4 mb-sm-0">
        <div class="text-subtitle-1 mb-3 mt-1 font-weight-bold" :lang="currentLocale">
          {{ $t('backup.sources.title') }}
        </div>
        <v-switch
          v-model="stableBackup"
          :label="$t('settings.database.stable')"
          :lang="currentLocale"
          class="view-field pl-2"
          color="primary"
          hide-details
        ></v-switch>
        <v-switch
          v-model="lazerBackup"
          :label="$t('settings.database.lazer')"
          :lang="currentLocale"
          class="view-field pl-2"
          color="primary"
          hide-details
        ></v-switch>
      </div>

      <v-divider vertical class="mx-4 d-none d-sm-flex"></v-divider>

      <!-- Content Column -->
      <div class="flex-grow-1">
        <div class="text-subtitle-1 mb-3 mt-1 font-weight-bold" :lang="currentLocale">
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

    <!-- Info Alerts -->
    <v-alert
      v-if="backupOnlineIds || backupLocalBeatmaps"
      type="info"
      variant="tonal"
      density="compact"
      class="local-backup-alert mt-4"
      :lang="currentLocale"
    >
      <div v-if="backupOnlineIds">{{ $t('backup.content.onlineIdsPending') }}</div>
      <div v-if="backupLocalBeatmaps">{{ $t('backup.content.localBeatmapsPending') }}</div>
    </v-alert>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValueStable: boolean
  modelValueLazer: boolean
  modelValueOnlineIds: boolean
  modelValueLocalBeatmaps: boolean
  currentLocale: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValueStable', val: boolean): void
  (e: 'update:modelValueLazer', val: boolean): void
  (e: 'update:modelValueOnlineIds', val: boolean): void
  (e: 'update:modelValueLocalBeatmaps', val: boolean): void
}>()

const stableBackup = computed({
  get: () => props.modelValueStable,
  set: (val: boolean) => emit('update:modelValueStable', val)
})

const lazerBackup = computed({
  get: () => props.modelValueLazer,
  set: (val: boolean) => emit('update:modelValueLazer', val)
})

const backupOnlineIds = computed({
  get: () => props.modelValueOnlineIds,
  set: (val: boolean) => emit('update:modelValueOnlineIds', val)
})

const backupLocalBeatmaps = computed({
  get: () => props.modelValueLocalBeatmaps,
  set: (val: boolean) => emit('update:modelValueLocalBeatmaps', val)
})
</script>

<style scoped>
.backup-sources-card {
  width: 100%;
}
</style>
