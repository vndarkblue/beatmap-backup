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
          @retry-failed="handleRetryFailed"
          @export-failed-backup="handleExportFailedBackup"
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
      @discard="handleDiscardRecovery"
      @resume="handleResumeRecovery"
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
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import DownloadSetupCard from './download/DownloadSetupCard.vue'
import DownloadQueueOverview from './download/DownloadQueueOverview.vue'
import DownloadActiveTable from './download/DownloadActiveTable.vue'
import DownloadRecoveryDialog from './download/DownloadRecoveryDialog.vue'
import type { DownloadTask, RecoveryState } from '../../../preload/electronApiTypes'

const { locale, t } = useI18n()
const currentLocale = computed(() => locale.value)

// Enhanced File type for Electron
interface ElectronFile extends File {
  path: string
}

// Queue Summary interface
type QueueSummary = {
  total: number
  success: number
  failed: number
  downloadPath?: string | null
  durationMs?: number
}

// Download settings from composable
const {
  threadCount,
  selectedSources,
  removeFromStable,
  removeFromLazer,
  noVideo,
  load: loadDownloadSettings
} = useDownloadSettings()

// Download Form State
const selectedFile = ref<ElectronFile | null>(null)
const selectedFileName = ref('')
const downloadPath = ref('')
const isDownloading = ref(false)
const statusMessage = ref('')
const isSuccess = ref(false)

// Download Manager State
const showDownloadManager = ref(false)
const isInitializing = ref(true)
const isPaused = ref(false)
const confirmingStop = ref(false)
const completedFiles = ref(0)
const totalFiles = ref(0)
const queueProgress = ref(0)
const downloadFiles = ref<DownloadTask[]>([])
const showCompletedToast = ref(false)
const completedSummary = ref<QueueSummary | null>(null)
const completedDownloadPath = ref('')
const showCompletedDownloads = ref(false)
const showFailedDownloads = ref(true)
const isRetryingFailed = ref(false)
const isExportingFailed = ref(false)
const showRecoveryDialog = ref(false)
const showDiscardConfirm = ref(false)
const recoveryActionLoading = ref(false)
const recoveryState = ref<RecoveryState | null>(null)
const MAX_RENDERED_DOWNLOAD_ROWS = 600

let unsubscribeDownloadEvents: (() => void) | null = null
let downloadStateFlushHandle: number | null = null
const downloadTaskIndex = new Map<string, number>()
const pendingAddedTasks: DownloadTask[] = []
const pendingTaskUpdates = new Map<string, DownloadTask>()

// Load settings
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

// Make sure settings are loaded when component is mounted
onMounted(() => {
  loadSettings()
  void syncQueueRuntimeState()
  void checkRecoveryQueue()
  connectDownloadEvents()
})

onUnmounted(() => {
  disconnectDownloadEvents()
})

// Computed properties
const isDownloadEnabled = computed(() => {
  return selectedFile.value !== null && selectedSources.value.length > 0
})

const downloadingFiles = computed(() =>
  downloadFiles.value.filter((task) => task.status === 'downloading')
)

const completedDownloadFiles = computed(() =>
  downloadFiles.value.filter((task) => task.status === 'completed')
)

const failedDownloadFiles = computed(() =>
  downloadFiles.value.filter((task) => task.status === 'error')
)

const isQueueInactive = computed(() => {
  return (
    showDownloadManager.value &&
    downloadingFiles.value.length === 0 &&
    downloadFiles.value.filter((t) => t.status === 'waiting').length === 0
  )
})

const visibleDownloadingFiles = computed(() =>
  downloadingFiles.value.slice(0, MAX_RENDERED_DOWNLOAD_ROWS)
)

// Handle file selection
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

// Methods
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
        // Vue reactive arrays are proxies; send a plain array for Electron IPC cloning.
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

// Download Manager Methods
const checkRecoveryQueue = async (): Promise<void> => {
  if (showDownloadManager.value) return
  try {
    const state = await window.electronAPI.download.getState()
    if (!state.recovery?.canResume) return
    recoveryState.value = state.recovery
    showDiscardConfirm.value = false
    showRecoveryDialog.value = true
  } catch (error) {
    console.error('Failed to check recovery queue:', error)
  }
}

const syncQueueRuntimeState = async (): Promise<void> => {
  try {
    const state = await window.electronAPI.download.getState()
    isPaused.value = Boolean(state.runtime?.isPaused)
  } catch (error) {
    console.error('Failed to sync queue runtime state:', error)
  }
}

const handleResumeRecovery = async (): Promise<void> => {
  recoveryActionLoading.value = true
  try {
    const res = await window.electronAPI.download.handleRecovery('resume')
    if (res.success) {
      showDownloadManager.value = true
      showRecoveryDialog.value = false
      showDiscardConfirm.value = false
      recoveryState.value = null
      return
    }
    isSuccess.value = false
    statusMessage.value = t('download.recovery.resumeFailed')
  } catch (error) {
    console.error('Failed to resume queue:', error)
    isSuccess.value = false
    statusMessage.value = t('download.recovery.resumeFailed')
  } finally {
    recoveryActionLoading.value = false
  }
}

const handleDiscardRecovery = async (): Promise<void> => {
  if (!showDiscardConfirm.value) {
    showDiscardConfirm.value = true
    return
  }
  recoveryActionLoading.value = true
  try {
    const res = await window.electronAPI.download.handleRecovery('discard')
    if (res.success) {
      showRecoveryDialog.value = false
      showDiscardConfirm.value = false
      recoveryState.value = null
      return
    }
    isSuccess.value = false
    statusMessage.value = t('download.recovery.discardFailed')
  } catch (error) {
    console.error('Failed to discard recovered queue:', error)
    isSuccess.value = false
    statusMessage.value = t('download.recovery.discardFailed')
  } finally {
    recoveryActionLoading.value = false
  }
}

// Status helpers
const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'waiting':
      return '$clockOutline'
    case 'downloading':
      return '$download'
    case 'completed':
      return '$checkCircle'
    case 'error':
      return '$alertCircle'
    default:
      return '$helpCircle'
  }
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'waiting':
      return 'grey'
    case 'downloading':
      return 'primary'
    case 'completed':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
}

const getStatusText = (status: string): string => {
  switch (status) {
    case 'waiting':
      return t('download.manager.status.waiting')
    case 'downloading':
      return t('download.manager.status.downloading')
    case 'completed':
      return t('download.manager.status.completed')
    case 'error':
      return t('download.manager.status.error')
    default:
      return status
  }
}

// Format helpers
const formatSpeed = (bytesPerSec: number): string => {
  if (!bytesPerSec || bytesPerSec <= 0) return '0\u00A0KB/s'
  const kbps = bytesPerSec / 1024
  if (kbps < 1024) return `${kbps.toFixed(1)}\u00A0KB/s`
  return `${(kbps / 1024).toFixed(1)}\u00A0MB/s`
}

const formatTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m\u00A0${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h\u00A0${remainingMinutes}m`
}

const getDownloadFileName = (file: DownloadTask): string => {
  return file.fileName || `${file.beatmapsetId}.osz`
}

// Update download state
const rebuildDownloadTaskIndex = (tasks: DownloadTask[]): void => {
  downloadTaskIndex.clear()
  for (let i = 0; i < tasks.length; i++) {
    downloadTaskIndex.set(tasks[i].id, i)
  }
}

const updateDownloadStats = (tasks: DownloadTask[]): void => {
  totalFiles.value = tasks.length
  completedFiles.value = tasks.filter((t) => t.status === 'completed').length

  const totalProgress = tasks.reduce((sum, task) => sum + task.progress, 0)
  queueProgress.value = tasks.length > 0 ? totalProgress / tasks.length : 0
}

const setDownloadTasks = (tasks: DownloadTask[]): void => {
  downloadFiles.value = tasks
  rebuildDownloadTaskIndex(tasks)
  updateDownloadStats(tasks)
}

const flushPendingDownloadState = (): void => {
  downloadStateFlushHandle = null

  if (pendingAddedTasks.length === 0 && pendingTaskUpdates.size === 0) {
    return
  }

  let nextTasks = downloadFiles.value
  let mutated = false

  if (pendingAddedTasks.length > 0) {
    nextTasks = nextTasks.concat(pendingAddedTasks)
    for (let i = nextTasks.length - pendingAddedTasks.length; i < nextTasks.length; i++) {
      downloadTaskIndex.set(nextTasks[i].id, i)
    }
    pendingAddedTasks.length = 0
    mutated = true
  }

  if (pendingTaskUpdates.size > 0) {
    if (!mutated) {
      nextTasks = nextTasks.slice()
    }
    for (const [id, updatedTask] of pendingTaskUpdates) {
      let index = downloadTaskIndex.get(id)
      if (index === undefined || index >= nextTasks.length || nextTasks[index].id !== id) {
        index = nextTasks.findIndex((t) => t.id === id)
        if (index !== -1) {
          downloadTaskIndex.set(id, index)
        }
      }
      if (index !== -1 && index !== undefined) {
        nextTasks[index] = updatedTask
      }
    }
  }
  pendingTaskUpdates.clear()

  downloadFiles.value = nextTasks
  updateDownloadStats(nextTasks)
}

const scheduleDownloadStateFlush = (): void => {
  if (downloadStateFlushHandle !== null) return
  downloadStateFlushHandle = window.requestAnimationFrame(flushPendingDownloadState)
}

const queueAddedTasks = (tasks: DownloadTask[]): void => {
  pendingAddedTasks.push(...tasks)
  scheduleDownloadStateFlush()
}

const queueTaskUpdate = (task: DownloadTask): void => {
  pendingTaskUpdates.set(task.id, task)
  scheduleDownloadStateFlush()
}

// Action handlers
const togglePause = async (): Promise<void> => {
  try {
    await window.electronAPI.download.control(isPaused.value ? 'resume' : 'pause')
  } catch (error) {
    console.error('Failed to toggle pause:', error)
  }
}

const requestStopDownload = (): void => {
  confirmingStop.value = true
}

const confirmStopDownload = async (): Promise<void> => {
  confirmingStop.value = false
  try {
    await window.electronAPI.download.control('stop')
  } catch (error) {
    console.error('Failed to stop download:', error)
  }
}

const cancelStopDownload = (): void => {
  confirmingStop.value = false
}

const openFolder = async (): Promise<void> => {
  const dir = completedDownloadPath.value.trim()
  if (!dir) return
  try {
    const result = await window.electronAPI.system.openPath(dir)
    if (result) {
      console.error('Failed to open folder:', result)
    }
  } catch (e) {
    console.error('Failed to open folder:', e)
  }
}

const handleRetryFailed = async (): Promise<void> => {
  try {
    isRetryingFailed.value = true
    const result = await window.electronAPI.download.retryFailed()
    if (result?.success && result.count > 0) {
      statusMessage.value = t('download.manager.retryStarted', { count: result.count })
      isSuccess.value = true
    }
  } catch (error) {
    console.error('Failed to retry failed tasks:', error)
  } finally {
    isRetryingFailed.value = false
  }
}

const handleExportFailedBackup = async (): Promise<void> => {
  try {
    isExportingFailed.value = true
    const result = await window.electronAPI.download.exportFailedBackup()
    if (result?.success && result.filePath) {
      statusMessage.value = t('download.manager.exportSuccess', { count: result.count })
      isSuccess.value = true
    }
  } catch (error) {
    console.error('Failed to export failed backup:', error)
  } finally {
    isExportingFailed.value = false
  }
}

const handleDismissQueue = async (): Promise<void> => {
  try {
    await window.electronAPI.download.clearQueue()
  } catch (error) {
    console.error('Failed to clear queue:', error)
  }
}

// Event Dispatcher setup
const connectDownloadEvents = async (): Promise<void> => {
  if (unsubscribeDownloadEvents) {
    isInitializing.value = false
    return
  }

  try {
    const initialTasks = await window.electronAPI.download.getTasks()
    if (initialTasks && initialTasks.length > 0) {
      setDownloadTasks(initialTasks)
      showDownloadManager.value = true
    }
  } catch (err) {
    console.error('Failed to get initial tasks:', err)
  } finally {
    isInitializing.value = false
  }

  unsubscribeDownloadEvents = window.electronAPI.download.onEvent((payload) => {
    const { event, data } = payload
    if (event === 'initialState' && Array.isArray(data)) {
      setDownloadTasks(data)
    } else if (event === 'initialStateChunk' && Array.isArray(data)) {
      queueAddedTasks(data)
    } else if (event === 'initialStateComplete') {
      scheduleDownloadStateFlush()
    } else if (event === 'tasksAdded' && Array.isArray(data)) {
      queueAddedTasks(data)
    } else if (event === 'taskUpdated' && data) {
      queueTaskUpdate(data)
    } else if (event === 'taskCompleted' && data) {
      queueTaskUpdate(data)
    } else if (event === 'taskError' && data) {
      queueTaskUpdate(data)
    } else if (event === 'queuePaused') {
      isPaused.value = true
    } else if (event === 'queueResumed') {
      isPaused.value = false
    } else if (event === 'queueCleared') {
      showDownloadManager.value = false
      isPaused.value = false
      confirmingStop.value = false
      completedFiles.value = 0
      totalFiles.value = 0
      queueProgress.value = 0
      downloadFiles.value = []
      rebuildDownloadTaskIndex([])
      pendingAddedTasks.length = 0
      pendingTaskUpdates.clear()

      const summary = completedSummary.value
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
        completedSummary.value = null
      } else {
        isSuccess.value = false
        statusMessage.value = t('download.cancelled')
      }
    } else if (event === 'queueCompleted' && data) {
      completedSummary.value = data
      completedDownloadPath.value = typeof data?.downloadPath === 'string' ? data.downloadPath : ''
      showCompletedToast.value = true
      if (data.failed > 0) {
        showFailedDownloads.value = true
        isSuccess.value = false
        statusMessage.value = t('download.finishedWithErrors', {
          success: data.success,
          total: data.total,
          failed: data.failed
        })
      }
    }
  })
}

const disconnectDownloadEvents = (): void => {
  if (unsubscribeDownloadEvents) {
    unsubscribeDownloadEvents()
    unsubscribeDownloadEvents = null
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
