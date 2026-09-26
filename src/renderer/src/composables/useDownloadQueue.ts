import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DownloadTask, RecoveryState } from '../../../preload/electronApiTypes'

export type QueueSummary = {
  total: number
  success: number
  failed: number
  downloadPath?: string | null
  durationMs?: number
}

const MAX_RENDERED_DOWNLOAD_ROWS = 600

export interface UseDownloadQueueReturn {
  showDownloadManager: Ref<boolean>
  isInitializing: Ref<boolean>
  isPaused: Ref<boolean>
  confirmingStop: Ref<boolean>
  completedFiles: Ref<number>
  totalFiles: Ref<number>
  queueProgress: Ref<number>
  downloadFiles: Ref<DownloadTask[]>
  showCompletedToast: Ref<boolean>
  completedSummary: Ref<QueueSummary | null>
  completedDownloadPath: Ref<string>
  showCompletedDownloads: Ref<boolean>
  showFailedDownloads: Ref<boolean>
  isRetryingFailed: Ref<boolean>
  isExportingFailed: Ref<boolean>
  showRecoveryDialog: Ref<boolean>
  showDiscardConfirm: Ref<boolean>
  recoveryActionLoading: Ref<boolean>
  recoveryState: Ref<RecoveryState | null>
  downloadingFiles: ComputedRef<DownloadTask[]>
  completedDownloadFiles: ComputedRef<DownloadTask[]>
  failedDownloadFiles: ComputedRef<DownloadTask[]>
  isQueueInactive: ComputedRef<boolean>
  visibleDownloadingFiles: ComputedRef<DownloadTask[]>
  checkRecoveryQueue: () => Promise<void>
  syncQueueRuntimeState: () => Promise<void>
  handleResumeRecovery: (onSuccess?: () => void, onError?: (msg: string) => void) => Promise<void>
  handleDiscardRecovery: (onSuccess?: () => void, onError?: (msg: string) => void) => Promise<void>
  getStatusIcon: (status: string) => string
  getStatusColor: (status: string) => string
  getStatusText: (status: string) => string
  formatSpeed: (bytesPerSec: number) => string
  formatTime: (seconds: number) => string
  getDownloadFileName: (file: DownloadTask) => string
  togglePause: () => Promise<void>
  requestStopDownload: () => void
  confirmStopDownload: () => Promise<void>
  cancelStopDownload: () => void
  openFolder: () => Promise<void>
  handleRetryFailed: (onFeedback?: (msg: string, success: boolean) => void) => Promise<void>
  handleExportFailedBackup: (onFeedback?: (msg: string, success: boolean) => void) => Promise<void>
  handleDismissQueue: () => Promise<void>
  connectDownloadEvents: (onQueueCleared?: (summary: QueueSummary | null) => void) => Promise<void>
  disconnectDownloadEvents: () => void
}

export function useDownloadQueue(): UseDownloadQueueReturn {
  const { t } = useI18n()

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

  let unsubscribeDownloadEvents: (() => void) | null = null
  let downloadStateFlushHandle: number | null = null
  const downloadTaskIndex = new Map<string, number>()
  const pendingAddedTasks: DownloadTask[] = []
  const pendingTaskUpdates = new Map<string, DownloadTask>()

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

  const handleResumeRecovery = async (
    onSuccess?: () => void,
    onError?: (msg: string) => void
  ): Promise<void> => {
    recoveryActionLoading.value = true
    try {
      const res = await window.electronAPI.download.handleRecovery('resume')
      if (res.success) {
        showDownloadManager.value = true
        showRecoveryDialog.value = false
        showDiscardConfirm.value = false
        recoveryState.value = null
        onSuccess?.()
        return
      }
      onError?.(t('download.recovery.resumeFailed'))
    } catch (error) {
      console.error('Failed to resume queue:', error)
      onError?.(t('download.recovery.resumeFailed'))
    } finally {
      recoveryActionLoading.value = false
    }
  }

  const handleDiscardRecovery = async (
    onSuccess?: () => void,
    onError?: (msg: string) => void
  ): Promise<void> => {
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
        onSuccess?.()
        return
      }
      onError?.(t('download.recovery.discardFailed'))
    } catch (error) {
      console.error('Failed to discard recovered queue:', error)
      onError?.(t('download.recovery.discardFailed'))
    } finally {
      recoveryActionLoading.value = false
    }
  }

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

  const handleRetryFailed = async (
    onFeedback?: (msg: string, success: boolean) => void
  ): Promise<void> => {
    try {
      isRetryingFailed.value = true
      const result = await window.electronAPI.download.retryFailed()
      if (result?.success && result.count > 0) {
        onFeedback?.(t('download.manager.retryStarted', { count: result.count }), true)
      }
    } catch (error) {
      console.error('Failed to retry failed tasks:', error)
    } finally {
      isRetryingFailed.value = false
    }
  }

  const handleExportFailedBackup = async (
    onFeedback?: (msg: string, success: boolean) => void
  ): Promise<void> => {
    try {
      isExportingFailed.value = true
      const result = await window.electronAPI.download.exportFailedBackup()
      if (result?.success && result.filePath) {
        onFeedback?.(t('download.manager.exportSuccess', { count: result.count }), true)
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

  const connectDownloadEvents = async (
    onQueueCleared?: (summary: QueueSummary | null) => void
  ): Promise<void> => {
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
        completedSummary.value = null
        onQueueCleared?.(summary)
      } else if (event === 'queueCompleted' && data) {
        completedSummary.value = data
        completedDownloadPath.value =
          typeof data?.downloadPath === 'string' ? data.downloadPath : ''
        showCompletedToast.value = true
        if (data.failed > 0) {
          showFailedDownloads.value = true
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

  return {
    showDownloadManager,
    isInitializing,
    isPaused,
    confirmingStop,
    completedFiles,
    totalFiles,
    queueProgress,
    downloadFiles,
    showCompletedToast,
    completedSummary,
    completedDownloadPath,
    showCompletedDownloads,
    showFailedDownloads,
    isRetryingFailed,
    isExportingFailed,
    showRecoveryDialog,
    showDiscardConfirm,
    recoveryActionLoading,
    recoveryState,
    downloadingFiles,
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
  }
}
