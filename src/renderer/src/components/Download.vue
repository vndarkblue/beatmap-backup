<template>
  <AppViewShell :title="$t('download.title')" :lang="currentLocale">
    <AppIsland :card-class="{ 'recovery-blur': showRecoveryDialog }">
      <!-- Initializing State - prevents layout flash on tab switch -->
      <div v-if="isInitializing" class="download-loading-state">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <!-- Download Form - shown when not downloading -->
      <DownloadSetupCard
        v-else-if="!showDownloadManager"
        v-model:model-value-download-path="downloadPath"
        :selected-file-name="selectedFileName"
        :is-download-enabled="isDownloadEnabled"
        :is-downloading="isDownloading"
        :status-message="statusMessage"
        :is-success="isSuccess"
        :current-locale="currentLocale"
        @select-file="handleFileSelect"
        @clear-download-path="clearDownloadPath"
        @select-download-path="selectDownloadPath"
        @start-download="handleDownload"
      />

      <!-- Download Manager - shown when downloading -->
      <div v-else>
        <DownloadQueueOverview
          :is-paused="isPaused"
          :confirming-stop="confirmingStop"
          :completed-files="completedFiles"
          :total-files="totalFiles"
          :queue-progress="queueProgress"
          :current-locale="currentLocale"
          :can-dismiss="
            isQueueInactive && (failedDownloadFiles.length > 0 || completedDownloadFiles.length > 0)
          "
          @toggle-pause="togglePause"
          @request-stop="requestStopDownload"
          @confirm-stop="confirmStopDownload"
          @cancel-stop="cancelStopDownload"
          @dismiss-queue="handleDismissQueue"
        />

        <DownloadActiveTable
          v-model:model-value-show-completed="showCompletedDownloads"
          v-model:model-value-show-failed="showFailedDownloads"
          :visible-downloading-files="visibleDownloadingFiles"
          :completed-download-files="completedDownloadFiles"
          :failed-download-files="failedDownloadFiles"
          :is-paused="isPaused"
          :is-retrying="isRetryingFailed"
          :is-exporting-failed="isExportingFailed"
          :get-status-text="getStatusText"
          :get-status-color="getStatusColor"
          :get-status-icon="getStatusIcon"
          :get-download-file-name="getDownloadFileName"
          :format-speed="formatSpeed"
          :format-time="formatTime"
          @retry-failed="() => handleRetryFailed(onFeedback)"
          @export-failed-backup="() => handleExportFailedBackup(onFeedback)"
        />
      </div>
    </AppIsland>

    <!-- Recovery Download Queue Dialog -->
    <DownloadRecoveryDialog
      v-model="showRecoveryDialog"
      :recovery-state="recoveryState"
      :show-discard-confirm="showDiscardConfirm"
      :recovery-action-loading="recoveryActionLoading"
      :current-locale="currentLocale"
      @discard="() => handleDiscardRecovery(undefined, onRecoveryError)"
      @resume="() => handleResumeRecovery(undefined, onRecoveryError)"
    />

    <!-- Completion Toast -->
    <v-snackbar
      v-model="showCompletedToast"
      color="success"
      :timeout="FRONTEND_TIMINGS_MS.DOWNLOAD_COMPLETED_TOAST"
    >
      <div>
        <strong>{{ $t('notifications.download.completed.title') }}</strong>
        <div v-if="completedSummary">
          {{ completedSummary.success }}/{{ completedSummary.total }} ·
          {{ completedSummary.downloadPath || '' }}
          <span v-if="completedSummary.failed && completedSummary.failed > 0">
            · {{ completedSummary.failed }} failed
          </span>
        </div>
      </div>
      <template #actions>
        <v-btn variant="text" @click="openFolder">
          {{ $t('notifications.actions.openFolder') }}
        </v-btn>
        <v-btn variant="text" @click="showCompletedToast = false">
          {{ $t('notifications.actions.dismiss') }}
        </v-btn>
      </template>
    </v-snackbar>
  </AppViewShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { FRONTEND_TIMINGS_MS } from '../../../config/frontendConstants'
import { useDownloadSettings } from '../composables/useDownloadSettings'
import { useDownloadQueue, type QueueSummary } from '../composables/useDownloadQueue'
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import DownloadSetupCard from './download/DownloadSetupCard.vue'
import DownloadQueueOverview from './download/DownloadQueueOverview.vue'
import DownloadActiveTable from './download/DownloadActiveTable.vue'
import DownloadRecoveryDialog from './download/DownloadRecoveryDialog.vue'

const { locale, t } = useI18n()
const currentLocale = computed(() => locale.value)

interface ElectronFile extends File {
  path: string
}

const {
  threadCount,
  selectedSources,
  removeFromStable,
  removeFromLazer,
  noVideo,
  load: loadDownloadSettings
} = useDownloadSettings()

const {
  showDownloadManager,
  isInitializing,
  isPaused,
  confirmingStop,
  completedFiles,
  totalFiles,
  queueProgress,
  showCompletedToast,
  completedSummary,
  showCompletedDownloads,
  showFailedDownloads,
  isRetryingFailed,
  isExportingFailed,
  showRecoveryDialog,
  showDiscardConfirm,
  recoveryActionLoading,
  recoveryState,
  completedDownloadFiles,
  failedDownloadFiles,
  isQueueInactive,
  visibleDownloadingFiles,
  checkRecoveryQueue,
  syncQueueRuntimeState,
  handleResumeRecovery,
  handleDiscardRecovery,
  getStatusIcon,
  getStatusColor,
  getStatusText,
  formatSpeed,
  formatTime,
  getDownloadFileName,
  togglePause,
  requestStopDownload,
  confirmStopDownload,
  cancelStopDownload,
  openFolder,
  handleRetryFailed,
  handleExportFailedBackup,
  handleDismissQueue,
  connectDownloadEvents,
  disconnectDownloadEvents
} = useDownloadQueue()

// Download Form State
const selectedFile = ref<ElectronFile | null>(null)
const selectedFileName = ref('')
const downloadPath = ref('')
const isDownloading = ref(false)
const statusMessage = ref('')
const isSuccess = ref(false)

const onFeedback = (msg: string, success: boolean): void => {
  statusMessage.value = msg
  isSuccess.value = success
}

const onRecoveryError = (msg: string): void => {
  isSuccess.value = false
  statusMessage.value = msg
}

const isDownloadEnabled = computed(() => {
  return selectedFile.value !== null && selectedSources.value.length > 0
})

const loadSettings = async (): Promise<void> => {
  try {
    const data = await window.electronAPI.settings.get()
    if (data.downloadPath) {
      downloadPath.value = data.downloadPath
      const validation = await window.electronAPI.settings.validatePath(
        'download',
        data.downloadPath
      )
      if (!validation.valid) {
        downloadPath.value = ''
        await saveDownloadPath('')
        console.warn('Loaded download path is invalid:', validation.error)
      }
    }
    loadDownloadSettings()
  } catch (error) {
    console.error('Failed to load settings:', error)
    loadDownloadSettings()
  }
}

onMounted(() => {
  loadSettings()
  void syncQueueRuntimeState()
  void checkRecoveryQueue()
  connectDownloadEvents((summary: QueueSummary | null) => {
    if (summary) {
      isSuccess.value = summary.failed === 0
      statusMessage.value =
        summary.failed > 0
          ? t('download.finishedWithErrors', {
              success: summary.success,
              total: summary.total,
              failed: summary.failed
            })
          : t('download.finished', { success: summary.success })
    } else {
      isSuccess.value = false
      statusMessage.value = t('download.cancelled')
    }
  })
})

onUnmounted(() => {
  disconnectDownloadEvents()
})

const handleFileSelect = async (): Promise<void> => {
  try {
    const filePath = await window.electronAPI.system.selectBackupFile()
    if (filePath) {
      const fileName = filePath.split(/[\\/]/).pop() || ''
      selectedFileName.value = fileName
      selectedFile.value = { name: fileName, path: filePath } as ElectronFile
    }
  } catch (error) {
    console.error('Failed to get file path:', error)
    statusMessage.value = t('download.errors.getFilePath')
    isSuccess.value = false
  }
}

const selectDownloadPath = async (): Promise<void> => {
  const dir = await window.electronAPI.system.selectDirectory()
  if (dir) {
    downloadPath.value = dir
    await saveDownloadPath(dir)
  }
}

const clearDownloadPath = async (): Promise<void> => {
  downloadPath.value = ''
  await saveDownloadPath('')
}

const saveDownloadPath = async (path: string): Promise<void> => {
  try {
    await window.electronAPI.settings.update({ downloadPath: path })
  } catch (error) {
    console.error('Failed to save download path:', error)
  }
}

const validateDownloadPath = async (
  path: string
): Promise<{ valid: boolean; error: string | null }> => {
  if (!path || path.trim().length === 0) {
    return { valid: true, error: null }
  }

  try {
    const res = await window.electronAPI.settings.validatePath('download', path)
    return { valid: res.valid, error: res.error || null }
  } catch (error) {
    console.error('Failed to validate download path:', error)
    return { valid: false, error: t('download.errors.downloadPathInvalid') }
  }
}

const handleDownload = async (): Promise<void> => {
  if (!isDownloadEnabled.value) return

  try {
    isDownloading.value = true
    statusMessage.value = ''

    const filePath = selectedFile.value?.path
    if (!filePath) {
      throw new Error('Could not get file path')
    }

    if (downloadPath.value && downloadPath.value.trim().length > 0) {
      const validation = await validateDownloadPath(downloadPath.value)
      if (!validation.valid) {
        let errorMessage = t('download.errors.downloadPathInvalid')
        if (validation.error) {
          if (validation.error.includes('does not exist')) {
            errorMessage = t('download.errors.downloadPathNotExist')
          } else if (validation.error.includes('not a directory')) {
            errorMessage = t('download.errors.downloadPathNotDirectory')
          } else if (
            validation.error.includes('write permission') ||
            validation.error.includes('No write permission')
          ) {
            errorMessage = t('download.errors.downloadPathNoPermission')
          } else {
            errorMessage = validation.error
          }
        }
        isSuccess.value = false
        statusMessage.value = errorMessage
        return
      }
    }

    await window.electronAPI.download.start({
      filePath,
      options: {
        threadCount: threadCount.value,
        sources: [...selectedSources.value],
        removeFromStable: removeFromStable.value,
        removeFromLazer: removeFromLazer.value,
        noVideo: noVideo.value
      },
      downloadPath: downloadPath.value || undefined
    })

    isSuccess.value = true
    statusMessage.value = t('download.started')
    showDownloadManager.value = true
    connectDownloadEvents()
  } catch (error) {
    console.error('Download failed:', error)
    isSuccess.value = false
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('already exist')) {
      statusMessage.value = t('download.errors.allBeatmapsExist')
    } else {
      statusMessage.value = msg || t('download.errors.downloadPathInvalid')
    }
  } finally {
    isDownloading.value = false
  }
}
</script>

<style scoped>
.recovery-blur {
  filter: blur(2px);
  pointer-events: none;
  user-select: none;
}

.download-loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 220px;
}
</style>
