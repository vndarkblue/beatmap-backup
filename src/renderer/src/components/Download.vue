<template>
  <AppViewShell :title="$t('download.title')" :lang="currentLocale">
    <AppIsland :card-class="{ 'recovery-blur': showRecoveryDialog }">
      <!-- Download Form - shown when not downloading -->
      <AppForm v-if="!showDownloadManager">
        <!-- File Selection -->
        <PathField
          :model-value="selectedFileName"
          mode="file"
          :label="$t('download.selectFile')"
          :rules="[(v) => !!v || $t('download.fileRequired')]"
          :lang="currentLocale"
          @browse="handleFileSelect"
        />

        <!-- Download Path -->
        <PathField
          v-model="downloadPath"
          mode="directory"
          :label="$t('download.path')"
          clearable
          @clear="clearDownloadPath"
          @browse="selectDownloadPath"
        />

        <!-- Download Button -->
        <v-btn
          color="primary"
          block
          class="view-field"
          :lang="currentLocale"
          :disabled="!isDownloadEnabled"
          :loading="isDownloading"
          @click="handleDownload"
        >
          {{ $t('download.button') }}
        </v-btn>
        <v-progress-linear
          v-if="isDownloading"
          indeterminate
          color="primary"
          class="mt-3"
        ></v-progress-linear>

        <!-- Status Message -->
        <div
          v-if="statusMessage"
          class="text-center mt-2"
          :class="{ 'text-success': isSuccess, 'text-error': !isSuccess }"
        >
          {{ statusMessage }}
        </div>
      </AppForm>

      <!-- Download Manager - shown when downloading -->
      <div v-else>
        <!-- Queue Overview -->
        <div class="d-flex align-center justify-space-between mb-4">
          <div class="text-h6">{{ $t('downloadManager.queueOverview') }}</div>
          <div class="d-flex">
            <v-btn
              :icon="isPaused ? '$play' : '$pause'"
              variant="text"
              :title="isPaused ? $t('downloadManager.resume') : $t('downloadManager.pause')"
              :lang="currentLocale"
              :disabled="confirmingStop"
              @click="togglePause"
            ></v-btn>
            <template v-if="confirmingStop">
              <v-btn
                icon="$check"
                variant="text"
                color="error"
                :title="$t('downloadManager.stopConfirmYes')"
                :lang="currentLocale"
                @click="confirmStopDownload"
              ></v-btn>
              <v-btn
                icon="$close"
                variant="text"
                :title="$t('downloadManager.stopConfirmNo')"
                :lang="currentLocale"
                @click="cancelStopDownload"
              ></v-btn>
            </template>
            <v-btn
              v-else
              icon="$stop"
              variant="text"
              :title="$t('downloadManager.stop')"
              :lang="currentLocale"
              @click="requestStopDownload"
            ></v-btn>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="mb-4">
          <div class="d-flex justify-space-between mb-2">
            <div>{{ $t('downloadManager.progress') }}</div>
            <div>{{ completedFiles }}/{{ totalFiles }} {{ $t('downloadManager.files') }}</div>
          </div>
          <v-progress-linear
            :model-value="queueProgress"
            color="primary"
            height="8"
            rounded
          ></v-progress-linear>
        </div>

        <!-- Downloading Files Table -->
        <div class="text-subtitle-1 mb-2">{{ $t('downloadManager.activeDownloads') }}</div>
        <v-table>
          <thead>
            <tr>
              <th>{{ $t('downloadManager.table.status') }}</th>
              <th>{{ $t('downloadManager.table.filename') }}</th>
              <th>{{ $t('downloadManager.table.speed') }}</th>
              <th>{{ $t('downloadManager.table.progress') }}</th>
              <th>{{ $t('downloadManager.table.remaining') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in visibleDownloadingFiles" :key="file.id">
              <td>
                <v-tooltip :text="getStatusText(file.status)" location="top">
                  <template #activator="{ props }">
                    <v-icon
                      v-bind="props"
                      :color="getStatusColor(file.status)"
                      :icon="getStatusIcon(file.status)"
                    ></v-icon>
                  </template>
                </v-tooltip>
              </td>
              <td>{{ getDownloadFileName(file) }}</td>
              <td>{{ formatSpeed(file.speed) }}</td>
              <td>
                <v-progress-linear
                  :model-value="file.progress"
                  color="primary"
                  height="4"
                  rounded
                ></v-progress-linear>
              </td>
              <td>{{ formatTime(file.remainingTime) }}</td>
            </tr>
            <tr v-if="visibleDownloadingFiles.length === 0">
              <td colspan="5" class="text-center text-medium-emphasis py-4">
                {{ $t('downloadManager.noActiveDownloads') }}
              </td>
            </tr>
          </tbody>
        </v-table>

        <!-- Completed Files Drawer -->
        <div class="completed-downloads-drawer mt-4">
          <button
            class="completed-downloads-toggle"
            type="button"
            :aria-expanded="showCompletedDownloads"
            @click="showCompletedDownloads = !showCompletedDownloads"
          >
            <span class="d-flex align-center ga-2">
              <v-icon icon="$checkCircle" color="success" size="20" />
              <span>{{ $t('downloadManager.completedDownloads') }}</span>
              <span class="text-medium-emphasis">({{ completedDownloadFiles.length }})</span>
            </span>
            <v-icon :icon="showCompletedDownloads ? '$chevronUp' : '$chevronDown'" />
          </button>
          <v-expand-transition>
            <div v-show="showCompletedDownloads" class="completed-downloads-content">
              <v-table>
                <thead>
                  <tr>
                    <th>{{ $t('downloadManager.table.status') }}</th>
                    <th>{{ $t('downloadManager.table.filename') }}</th>
                    <th>{{ $t('downloadManager.table.progress') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="file in visibleCompletedDownloadFiles" :key="file.id">
                    <td>
                      <v-tooltip :text="getStatusText(file.status)" location="top">
                        <template #activator="{ props }">
                          <v-icon
                            v-bind="props"
                            :color="getStatusColor(file.status)"
                            :icon="getStatusIcon(file.status)"
                          ></v-icon>
                        </template>
                      </v-tooltip>
                    </td>
                    <td>{{ getDownloadFileName(file) }}</td>
                    <td>
                      <v-progress-linear
                        :model-value="file.progress"
                        color="success"
                        height="4"
                        rounded
                      ></v-progress-linear>
                    </td>
                  </tr>
                  <tr v-if="visibleCompletedDownloadFiles.length === 0">
                    <td colspan="3" class="text-center text-medium-emphasis py-4">
                      {{ $t('downloadManager.noCompletedDownloads') }}
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-expand-transition>
        </div>
      </div>
    </AppIsland>

    <!-- Recovery Download Queue Dialog -->
    <v-dialog v-model="showRecoveryDialog" max-width="520" persistent>
      <v-card class="recovery-dialog">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon icon="$restoreAlert" color="primary" />
          <span>{{ $t('download.recovery.title') }}</span>
        </v-card-title>
        <v-card-text>
          <div class="mb-2">
            {{
              $t('download.recovery.description', {
                total: recoveryState?.taskCount ?? 0
              })
            }}
          </div>
          <div class="text-medium-emphasis mb-3">{{ $t('download.recovery.hint') }}</div>
          <div class="text-medium-emphasis">
            {{
              $t('download.recovery.stats', {
                waiting: recoveryState?.waitingCount ?? 0,
                downloading: recoveryState?.downloadingCount ?? 0
              })
            }}
          </div>
          <div v-if="showDiscardConfirm" class="recovery-warning mt-4">
            <v-icon icon="$alert" size="18" />
            {{ $t('download.recovery.discardConfirm') }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            :color="showDiscardConfirm ? 'error' : undefined"
            variant="text"
            :disabled="recoveryActionLoading"
            @click="handleDiscardRecovery"
          >
            {{
              showDiscardConfirm
                ? $t('download.recovery.discardConfirmButton')
                : $t('download.recovery.discard')
            }}
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="recoveryActionLoading"
            @click="handleResumeRecovery"
          >
            {{ $t('download.recovery.resume') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
import AppForm from './common/AppForm.vue'
import PathField from './common/PathField.vue'
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

const visibleDownloadingFiles = computed(() =>
  downloadingFiles.value.slice(0, MAX_RENDERED_DOWNLOAD_ROWS)
)

const visibleCompletedDownloadFiles = computed(() =>
  completedDownloadFiles.value.slice(0, MAX_RENDERED_DOWNLOAD_ROWS)
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
      return t('download.status.waiting')
    case 'downloading':
      return t('download.status.downloading')
    case 'completed':
      return t('download.status.completed')
    case 'error':
      return t('download.status.error')
    default:
      return status
  }
}

// Format helpers
const formatSpeed = (speed: number): string => {
  if (!speed || speed <= 0) return '0 KB/s'
  if (speed < 1024) return `${Math.round(speed)} KB/s`
  return `${(speed / 1024).toFixed(1)} MB/s`
}

const formatTime = (seconds: number): string => {
  if (!seconds || seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
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

// Event Dispatcher setup
const connectDownloadEvents = async (): Promise<void> => {
  if (unsubscribeDownloadEvents) return

  try {
    const initialTasks = await window.electronAPI.download.getTasks()
    if (initialTasks && initialTasks.length > 0) {
      setDownloadTasks(initialTasks)
      showDownloadManager.value = true
    }
  } catch (err) {
    console.error('Failed to get initial tasks:', err)
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

.recovery-dialog {
  border: 1px solid rgba(127, 127, 127, 0.25);
  border-radius: 16px !important;
  padding: 8px 10px 6px;
}

.recovery-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-error));
  font-size: 0.95rem;
}

.completed-downloads-drawer {
  border-top: 1px solid rgba(127, 127, 127, 0.2);
}

.completed-downloads-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 0;
  color: inherit;
  font: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.text-subtitle-1 {
  font-family: var(--font-default) !important;
}

.completed-downloads-content {
  padding-bottom: 4px;
}
</style>
