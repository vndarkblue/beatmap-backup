<template>
  <div class="backup-action-container">
    <!-- Estimate Information Alert -->
    <v-alert
      v-if="estimateMessage"
      :type="estimateError ? 'warning' : 'info'"
      variant="tonal"
      density="comfortable"
      class="mb-3"
      :lang="currentLocale"
    >
      {{ estimateMessage }}
    </v-alert>

    <!-- Estimating Progress -->
    <v-progress-linear
      v-if="isEstimating"
      indeterminate
      color="primary"
      class="mb-3 anim-striped-bar"
      height="6"
      rounded
    ></v-progress-linear>

    <!-- Main Export Button -->
    <v-btn
      color="primary"
      block
      size="large"
      class="backup-submit-btn font-weight-bold"
      :lang="currentLocale"
      :disabled="!canExport"
      :loading="isExporting"
      @click="$emit('export')"
    >
      {{ $t('backup.button') }}
    </v-btn>

    <!-- Local Beatmaps (.osz) Export Progress Bar with Striped Animation -->
    <div
      v-if="isExporting && backupLocalBeatmaps && localExportProgress.total > 0"
      class="local-export-progress mt-4 p-3 rounded-lg"
    >
      <div class="d-flex justify-space-between text-caption mb-1 font-weight-medium">
        <span>
          {{
            $t('backup.localProgress', {
              current: localExportProgress.current,
              total: localExportProgress.total,
              percent: localExportProgress.percent
            })
          }}
        </span>
        <span class="font-weight-bold" style="color: var(--accent-pink)">
          {{ localExportProgress.percent }}%
        </span>
      </div>
      <v-progress-linear
        :model-value="localExportProgress.percent"
        color="primary"
        height="8"
        rounded
        class="anim-striped-bar"
      ></v-progress-linear>
      <div
        v-if="localExportProgress.currentBeatmap"
        class="text-caption text-truncate mt-1 text-medium-emphasis"
      >
        {{ localExportProgress.currentBeatmap }}
      </div>
    </div>

    <!-- Final Result Status Message -->
    <div
      v-if="statusMessage"
      class="text-center mt-3 font-weight-bold"
      :class="{ 'text-success': isSuccess, 'text-error': !isSuccess }"
    >
      {{ statusMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LocalExportProgress } from '../../../../preload/electronApiTypes'

defineProps<{
  estimateMessage: string
  estimateError: boolean
  isEstimating: boolean
  canExport: boolean
  isExporting: boolean
  backupLocalBeatmaps: boolean
  localExportProgress: LocalExportProgress
  statusMessage: string
  isSuccess: boolean
  currentLocale: string
}>()

defineEmits<{
  (e: 'export'): void
}>()
</script>

<style scoped>
.backup-action-container {
  margin-top: -12px;
}

.backup-submit-btn {
  letter-spacing: 1px !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 16px rgba(255, 102, 170, 0.25) !important;
  transition: all 0.2s ease !important;
}

.backup-submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(255, 102, 170, 0.35) !important;
}

.local-export-progress {
  background: rgba(127, 127, 127, 0.05);
  border: 1px solid var(--card-border-color);
}
</style>
