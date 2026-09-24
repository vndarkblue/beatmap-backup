<template>
  <!-- Database Status & Sync Island -->
  <AppIsland :title="$t('settings.database.title')" icon="$databaseOutline">
    <div class="text-subtitle-1 mb-3" :lang="currentLocale">
      {{
        $t('settings.database.totalBeatmapsets', {
          count: databaseStatus?.totals.beatmapsets ?? 0
        })
      }}
    </div>
    <div class="text-subtitle-1 mb-3" :lang="currentLocale">
      {{ $t('settings.database.totalBeatmaps', { count: databaseStatus?.totals.beatmaps ?? 0 }) }}
    </div>
    <div class="mb-4">
      <div class="text-subtitle-2 mb-1" :lang="currentLocale">
        {{ $t('settings.database.stable') }}:
        <span :class="stableStatus.colorClass">
          {{ $t(stableStatus.key) }}
        </span>
      </div>
      <div class="text-caption text-medium-emphasis" :lang="currentLocale">
        {{ $t('settings.database.lastSync') }}:
        {{ formatSyncTime(databaseStatus?.stable.lastSyncAt ?? null) }}
      </div>
    </div>
    <div class="mb-4">
      <div class="text-subtitle-2 mb-1" :lang="currentLocale">
        {{ $t('settings.database.lazer') }}:
        <span :class="lazerStatus.colorClass">
          {{ $t(lazerStatus.key) }}
        </span>
      </div>
      <div class="text-caption text-medium-emphasis" :lang="currentLocale">
        {{ $t('settings.database.lastSync') }}:
        {{ formatSyncTime(databaseStatus?.lazer.lastSyncAt ?? null) }}
      </div>
    </div>

    <v-progress-linear
      v-if="isSyncing"
      indeterminate
      color="primary"
      class="mb-3 anim-striped-bar"
    ></v-progress-linear>

    <div
      v-if="syncMessage"
      class="text-caption mb-3"
      :class="syncMessageIsError ? 'text-error' : 'text-medium-emphasis'"
      :lang="currentLocale"
    >
      {{ syncMessage }}
    </div>

    <v-btn
      color="primary"
      :loading="isSyncing"
      :disabled="isSyncing || !canSyncDatabase"
      :lang="currentLocale"
      @click="$emit('trigger-sync')"
    >
      {{ $t('settings.database.syncNow') }}
    </v-btn>
  </AppIsland>
</template>

<script setup lang="ts">
import AppIsland from '../common/AppIsland.vue'
import type { DatabaseStatus } from '../../../../services/database/types'

defineProps<{
  databaseStatus: DatabaseStatus | null
  stableStatus: { key: string; colorClass: string }
  lazerStatus: { key: string; colorClass: string }
  formatSyncTime: (date: number | null) => string
  isSyncing: boolean
  syncMessage: string
  syncMessageIsError: boolean
  canSyncDatabase: boolean
  currentLocale: string
}>()

defineEmits<{
  (e: 'trigger-sync'): void
}>()
</script>
