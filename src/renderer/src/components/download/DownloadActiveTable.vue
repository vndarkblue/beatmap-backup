<template>
  <div class="download-active-table-container">
    <!-- Active Downloads Section -->
    <div class="text-subtitle-1 font-weight-bold mb-2">
      {{ $t('download.manager.activeDownloads') }}
    </div>
    <v-card variant="outlined" class="active-table-card mb-4">
      <v-table class="active-downloads-table" density="compact">
        <thead>
          <tr>
            <th class="active-col-status">{{ $t('download.manager.table.status') }}</th>
            <th class="active-col-filename">{{ $t('download.manager.table.filename') }}</th>
            <th class="active-col-speed">{{ $t('download.manager.table.speed') }}</th>
            <th class="active-col-progress">{{ $t('download.manager.table.progress') }}</th>
            <th class="active-col-remaining">{{ $t('download.manager.table.remaining') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="file in visibleDownloadingFiles" :key="file.id">
            <td class="active-col-status">
              <v-tooltip :text="getStatusText(file.status)" location="top">
                <template #activator="{ props: actProps }">
                  <v-icon
                    v-bind="actProps"
                    :color="getStatusColor(file.status)"
                    :icon="getStatusIcon(file.status)"
                    size="18"
                  ></v-icon>
                </template>
              </v-tooltip>
            </td>
            <td class="active-col-filename font-weight-medium">
              <div class="d-flex align-center ga-2 text-truncate">
                <v-chip
                  v-if="file.assignedMirror || file.mirror?.name"
                  size="x-small"
                  variant="tonal"
                  color="secondary"
                  class="flex-shrink-0 font-weight-bold"
                >
                  {{ file.assignedMirror || file.mirror?.name }}
                </v-chip>
                <span class="text-truncate">{{ getDownloadFileName(file) }}</span>
              </div>
            </td>
            <td class="active-col-speed font-weight-bold" style="color: var(--accent-cyan)">
              {{ formatSpeed(file.speed) }}
            </td>
            <td class="active-col-progress">
              <v-progress-linear
                :model-value="file.progress"
                color="primary"
                height="6"
                rounded
                class="anim-striped-bar"
                :class="{ 'is-paused': isPaused }"
              ></v-progress-linear>
            </td>
            <td class="active-col-remaining text-medium-emphasis">
              {{ formatTime(file.remainingTime) }}
            </td>
          </tr>
          <tr v-if="visibleDownloadingFiles.length === 0">
            <td colspan="5" class="text-center text-medium-emphasis py-4">
              <span
                v-if="isPaused"
                class="d-inline-flex align-center ga-1 text-warning font-weight-medium"
              >
                <v-icon icon="$pause" size="16" />
                {{ $t('download.manager.queuePaused') }}
              </span>
              <span v-else>
                {{ $t('download.manager.noActiveDownloads') }}
              </span>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <!-- Completed Files Collapsible Drawer -->
    <div class="completed-downloads-drawer mt-4">
      <button
        class="completed-downloads-toggle"
        type="button"
        :aria-expanded="showCompleted"
        @click="showCompleted = !showCompleted"
      >
        <span class="d-flex align-center ga-2">
          <v-icon icon="$checkCircle" color="success" size="18" />
          <span class="font-weight-bold text-caption text-uppercase tracking-wider">
            {{ $t('download.manager.completedDownloads') }}
          </span>
          <v-chip size="x-small" color="success" variant="tonal" class="font-weight-bold">
            {{ completedDownloadFiles.length }}
          </v-chip>
        </span>
        <v-icon :icon="showCompleted ? '$chevronUp' : '$chevronDown'" size="18" />
      </button>

      <v-expand-transition>
        <div v-show="showCompleted" class="completed-downloads-content mt-2">
          <v-card
            v-if="completedDownloadFiles.length > 0"
            variant="outlined"
            class="completed-table-card"
          >
            <div class="completed-table-header">
              <span class="col-id">{{ $t('download.manager.table.id') }}</span>
              <span class="col-beatmap-name">{{ $t('download.manager.table.beatmapName') }}</span>
              <span class="col-actions">{{ $t('download.manager.table.actions') }}</span>
            </div>
            <SimpleBar class="completed-table-scroll">
              <div v-for="item in completedDownloadFiles" :key="item.id" class="completed-row">
                <div class="col-id">
                  <a
                    v-if="item.beatmapsetId"
                    :href="`https://osu.ppy.sh/beatmapsets/${item.beatmapsetId}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="beatmap-id-link"
                    :title="`https://osu.ppy.sh/beatmapsets/${item.beatmapsetId}`"
                  >
                    {{ item.beatmapsetId }}
                  </a>
                  <span v-else class="text-medium-emphasis">-</span>
                </div>
                <div
                  class="col-beatmap-name text-truncate text-caption font-weight-medium d-flex align-center ga-2"
                  :title="getBeatmapDisplayName(item)"
                >
                  <v-chip
                    v-if="item.lastUsedMirror || item.assignedMirror || item.mirror?.name"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    class="flex-shrink-0"
                  >
                    {{ item.lastUsedMirror || item.assignedMirror || item.mirror?.name }}
                  </v-chip>
                  <span class="text-truncate">{{ getBeatmapDisplayName(item) }}</span>
                </div>
                <div class="col-actions">
                  <v-tooltip
                    v-if="item.filePath"
                    :text="$t('download.manager.table.openFolder')"
                    location="top"
                  >
                    <template #activator="{ props: folderActProps }">
                      <v-btn
                        v-bind="folderActProps"
                        icon
                        variant="text"
                        size="x-small"
                        density="compact"
                        class="action-btn"
                        @click="openContainingFolder(item.filePath)"
                      >
                        <v-icon icon="$folderOpen" size="16" />
                      </v-btn>
                    </template>
                  </v-tooltip>
                </div>
              </div>
            </SimpleBar>
          </v-card>
          <div v-else class="text-center text-medium-emphasis py-4">
            {{ $t('download.manager.noCompletedDownloads') }}
          </div>
        </div>
      </v-expand-transition>
    </div>

    <!-- Failed Files Collapsible Drawer -->
    <div
      v-if="failedDownloadFiles && failedDownloadFiles.length > 0"
      class="failed-downloads-drawer mt-4"
    >
      <div class="d-flex align-center justify-space-between w-100 flex-wrap ga-2">
        <button
          class="failed-downloads-toggle"
          type="button"
          :aria-expanded="showFailed"
          @click="showFailed = !showFailed"
        >
          <span class="d-flex align-center ga-2">
            <v-icon icon="$alertCircle" color="error" size="18" />
            <span class="font-weight-bold text-caption text-uppercase tracking-wider text-error">
              {{ $t('download.manager.failedDownloads') }}
            </span>
            <v-chip size="x-small" color="error" variant="tonal" class="font-weight-bold">
              {{ failedDownloadFiles.length }}
            </v-chip>
          </span>
          <v-icon :icon="showFailed ? '$chevronUp' : '$chevronDown'" size="18" />
        </button>

        <div class="d-flex align-center ga-2">
          <v-btn
            variant="tonal"
            color="primary"
            size="small"
            :loading="isRetrying"
            @click="$emit('retry-failed')"
          >
            <v-icon icon="$refresh" start size="16" />
            {{ $t('download.manager.retryFailed') }}
          </v-btn>
          <v-btn
            variant="outlined"
            size="small"
            :loading="isExportingFailed"
            @click="$emit('export-failed-backup')"
          >
            <v-icon icon="$contentSaveOutline" start size="16" />
            {{ $t('download.manager.exportFailed') }}
          </v-btn>
        </div>
      </div>

      <v-expand-transition>
        <div v-show="showFailed" class="failed-downloads-content mt-2">
          <v-card variant="outlined" class="failed-table-card">
            <div class="failed-table-header">
              <span class="col-id">{{ $t('download.manager.table.id') }}</span>
              <span class="col-beatmap-name">{{ $t('download.manager.table.beatmapName') }}</span>
              <span class="col-reason">{{ $t('download.manager.table.reason') }}</span>
            </div>
            <SimpleBar class="failed-table-scroll">
              <div v-for="item in failedDownloadFiles" :key="item.id" class="failed-row">
                <div class="col-id">
                  <a
                    v-if="item.beatmapsetId"
                    :href="`https://osu.ppy.sh/beatmapsets/${item.beatmapsetId}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="beatmap-id-link"
                    :title="`https://osu.ppy.sh/beatmapsets/${item.beatmapsetId}`"
                  >
                    {{ item.beatmapsetId }}
                  </a>
                  <span v-else class="text-medium-emphasis">-</span>
                </div>
                <div
                  class="col-beatmap-name text-truncate text-caption font-weight-medium"
                  :title="getBeatmapDisplayName(item)"
                >
                  {{ getBeatmapDisplayName(item) }}
                </div>
                <div class="col-reason text-caption text-error font-weight-medium text-truncate">
                  {{ formatFailedReason(item.error) }}
                </div>
              </div>
            </SimpleBar>
          </v-card>
        </div>
      </v-expand-transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SimpleBar from 'simplebar-vue'
import 'simplebar-vue/dist/simplebar.min.css'
import type { DownloadTask } from '../../../../services/download/types'
import { parseTitleFromFileName } from '../../../../utils/beatmapTitle'

const { t } = useI18n()

const props = defineProps<{
  visibleDownloadingFiles: DownloadTask[]
  completedDownloadFiles: DownloadTask[]
  failedDownloadFiles?: DownloadTask[]
  modelValueShowCompleted: boolean
  modelValueShowFailed?: boolean
  isPaused?: boolean
  isRetrying?: boolean
  isExportingFailed?: boolean
  getStatusText: (status: DownloadTask['status']) => string
  getStatusColor: (status: DownloadTask['status']) => string
  getStatusIcon: (status: DownloadTask['status']) => string
  getDownloadFileName: (task: DownloadTask) => string
  formatSpeed: (speed: number) => string
  formatTime: (seconds: number) => string
}>()

const emit = defineEmits<{
  (e: 'update:modelValueShowCompleted', val: boolean): void
  (e: 'update:modelValueShowFailed', val: boolean): void
  (e: 'retry-failed'): void
  (e: 'export-failed-backup'): void
}>()

const showCompleted = computed({
  get: () => props.modelValueShowCompleted,
  set: (val: boolean) => emit('update:modelValueShowCompleted', val)
})

const showFailed = computed({
  get: () => props.modelValueShowFailed ?? true,
  set: (val: boolean) => emit('update:modelValueShowFailed', val)
})

const formatFailedReason = (rawError?: string): string => {
  if (!rawError) return t('download.manager.failedReasons.unknown')
  const lower = rawError.toLowerCase()
  if (lower.includes('404')) {
    return t('download.manager.failedReasons.notFound')
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return t('download.manager.failedReasons.rateLimit')
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return t('download.manager.failedReasons.timeout')
  }
  if (lower.includes('network') || lower.includes('econnreset') || lower.includes('fetch failed')) {
    return t('download.manager.failedReasons.network')
  }
  return rawError
}

const getBeatmapDisplayName = (item: DownloadTask): string => {
  if (item.beatmapTitle) return item.beatmapTitle
  const parsed = parseTitleFromFileName(item.fileName)
  if (parsed) return parsed
  return item.fileName || item.beatmapsetId
}

const openContainingFolder = async (filePath?: string): Promise<void> => {
  if (!filePath) return
  try {
    await window.electronAPI.system.showItemInFolder(filePath)
  } catch (error) {
    console.error('Failed to open containing folder:', error)
  }
}
</script>

<style scoped>
.active-table-card,
.completed-table-card,
.failed-table-card {
  border-radius: 12px !important;
  border-color: var(--card-border-color) !important;
  background: rgba(127, 127, 127, 0.03) !important;
  overflow: hidden;
}

.active-downloads-table th {
  font-weight: 700 !important;
  color: var(--main-text-color) !important;
  user-select: none;
}

.active-col-status {
  width: 95px;
  min-width: 95px;
  text-align: center;
  white-space: nowrap !important;
}

.active-col-filename {
  min-width: 180px;
}

.active-col-speed {
  width: 100px;
}

.active-col-progress {
  width: 160px;
}

.active-col-remaining {
  width: 90px;
}

.completed-downloads-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: rgba(127, 127, 127, 0.06);
  border: 1px solid var(--card-border-color);
  border-radius: 10px;
  cursor: pointer;
  color: var(--main-text-color);
  transition: background-color 0.2s ease;
}

.completed-downloads-toggle:hover {
  background: rgba(127, 127, 127, 0.1);
}

.completed-table-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--card-border-color);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted-color);
}

.completed-table-scroll {
  max-height: 300px;
  max-width: 100%;
}

.completed-table-scroll :deep(.simplebar-content-wrapper) {
  overflow: auto !important;
}

.completed-table-scroll :deep(.simplebar-track.simplebar-vertical) {
  width: 10px;
}

.completed-row {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(127, 127, 127, 0.08);
  transition: background-color 0.15s ease;
}

.completed-row:hover {
  background-color: rgba(127, 127, 127, 0.05);
}

.completed-row:last-child {
  border-bottom: none;
}

.col-id {
  width: 90px;
  min-width: 90px;
  flex-shrink: 0;
  white-space: nowrap !important;
}

.beatmap-id-link {
  color: var(--accent-cyan, #00e5ff);
  text-decoration: none;
  font-weight: 600;
  font-size: 12px;
  transition: opacity 0.15s ease;
}

.beatmap-id-link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.col-beatmap-name {
  flex: 1;
  min-width: 160px;
  padding-right: 12px;
}

.col-actions {
  width: 70px;
  min-width: 70px;
  flex-shrink: 0;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
}

.action-btn {
  color: var(--text-muted-color);
  transition:
    color 0.15s ease,
    background-color 0.15s ease;
}

.action-btn:hover {
  color: var(--main-text-color);
  background-color: rgba(127, 127, 127, 0.12);
}

.failed-downloads-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  cursor: pointer;
  color: var(--main-text-color);
  transition: background-color 0.2s ease;
}

.failed-downloads-toggle:hover {
  background: rgba(239, 68, 68, 0.14);
}

.failed-table-header {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--card-border-color);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted-color);
}

.failed-table-scroll {
  max-height: 250px;
  max-width: 100%;
}

.failed-table-scroll :deep(.simplebar-content-wrapper) {
  overflow: auto !important;
}

.failed-table-scroll :deep(.simplebar-track.simplebar-vertical) {
  width: 10px;
}

.failed-row {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(127, 127, 127, 0.08);
  transition: background-color 0.15s ease;
}

.failed-row:hover {
  background-color: rgba(239, 68, 68, 0.04);
}

.failed-row:last-child {
  border-bottom: none;
}

.col-reason {
  min-width: 180px;
  flex-shrink: 0;
  text-align: right;
}
</style>
