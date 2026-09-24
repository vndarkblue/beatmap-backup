import { ref, computed, type ComputedRef, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  AppDistributionType,
  UpdateDownloadProgress,
  UpdatePushEvent
} from '../../../preload/electronApiTypes'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

// Module-level singleton state shared across all components
const updateStatus = ref<UpdateStatus>('idle')
const hasUpdateAvailable = ref(false)
const latestVersion = ref('')
const distributionType = ref<AppDistributionType | null>(null)
const updateProgress = ref<UpdateDownloadProgress>({
  percent: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0
})
const releaseNotes = ref('')
const releaseDate = ref('')
const errorMessage = ref('')
const errorContext = ref<'check' | 'download'>('check')
const isManualCheck = ref(false)

let resetStatusTimer: ReturnType<typeof setTimeout> | null = null
let unsubscribeListener: (() => void) | null = null
let isInitialized = false

export interface UseUpdaterReturn {
  updateStatus: Ref<UpdateStatus>
  hasUpdateAvailable: Ref<boolean>
  latestVersion: Ref<string>
  distributionType: Ref<AppDistributionType | null>
  updateProgress: Ref<UpdateDownloadProgress>
  releaseNotes: Ref<string>
  releaseDate: Ref<string>
  errorMessage: Ref<string>
  errorContext: Ref<'check' | 'download'>
  isInstaller: ComputedRef<boolean>
  isPortableOrOther: ComputedRef<boolean>
  formattedReleaseDate: (locale?: string) => string
  formattedTransferred: ComputedRef<string>
  formattedSpeed: ComputedRef<string>
  distributionLabel: ComputedRef<string>
  initialize: () => Promise<void>
  checkForUpdates: (manual?: boolean) => Promise<void>
  doUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  teardown: () => void
}

export function useUpdater(): UseUpdaterReturn {
  const { t } = useI18n()

  const isInstaller = computed(() => distributionType.value === 'win-installer')
  const isPortableOrOther = computed(
    () => distributionType.value === 'win-portable' || distributionType.value === 'linux-other'
  )

  const formattedReleaseDate = (locale?: string): string => {
    if (!releaseDate.value) return ''
    try {
      return new Date(releaseDate.value).toLocaleDateString(locale || undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return releaseDate.value
    }
  }

  const formattedTransferred = computed(() => {
    if (updateProgress.value.total <= 0) return ''
    const mbTrans = (updateProgress.value.transferred / (1024 * 1024)).toFixed(1)
    const mbTotal = (updateProgress.value.total / (1024 * 1024)).toFixed(1)
    return `${mbTrans} MB / ${mbTotal} MB`
  })

  const formattedSpeed = computed(() => {
    if (updateProgress.value.bytesPerSecond <= 0) return ''
    const mbSpeed = (updateProgress.value.bytesPerSecond / (1024 * 1024)).toFixed(2)
    return `${mbSpeed} MB/s`
  })

  const distributionLabel = computed(() => {
    switch (distributionType.value) {
      case 'win-installer':
        return 'Windows (Installer)'
      case 'win-portable':
        return 'Windows (Portable)'
      case 'linux-appimage':
        return 'Linux (AppImage)'
      case 'linux-other':
        return 'Linux (Package)'
      default:
        return 'Desktop'
    }
  })

  const setupEventListener = (): void => {
    if (unsubscribeListener || !window.electronAPI?.updater?.onEvent) return

    unsubscribeListener = window.electronAPI.updater.onEvent((evt: UpdatePushEvent) => {
      if (evt.event === 'checking') {
        if (isManualCheck.value) {
          updateStatus.value = 'checking'
        }
      } else if (evt.event === 'updateAvailable') {
        hasUpdateAvailable.value = true
        latestVersion.value = (evt.data.latestVersion || '').replace(/^v/, '')
        releaseNotes.value = evt.data.releaseNotes || ''
        releaseDate.value = evt.data.releaseDate || ''
        distributionType.value = evt.data.distributionType
        updateStatus.value = 'available'
      } else if (evt.event === 'updateNotAvailable') {
        hasUpdateAvailable.value = false
        latestVersion.value = ''
        releaseNotes.value = ''
        releaseDate.value = ''
        distributionType.value = evt.data.distributionType
        if (isManualCheck.value) {
          updateStatus.value = 'up-to-date'
          if (resetStatusTimer) clearTimeout(resetStatusTimer)
          resetStatusTimer = setTimeout(() => {
            if (updateStatus.value === 'up-to-date') {
              updateStatus.value = 'idle'
            }
          }, 4000)
        } else if (updateStatus.value === 'checking') {
          updateStatus.value = 'idle'
        }
      } else if (evt.event === 'downloadProgress') {
        errorContext.value = 'download'
        updateStatus.value = 'downloading'
        updateProgress.value = evt.data
      } else if (evt.event === 'updateDownloaded') {
        updateStatus.value = 'downloaded'
      } else if (evt.event === 'error') {
        errorMessage.value = evt.data.message
        if (isManualCheck.value || updateStatus.value === 'downloading') {
          errorContext.value = updateStatus.value === 'downloading' ? 'download' : 'check'
          updateStatus.value = 'error'
        }
      }
    })
  }

  const initialize = async (): Promise<void> => {
    setupEventListener()
    if (isInitialized) return
    isInitialized = true

    try {
      if (window.electronAPI?.updater?.getDistributionType) {
        distributionType.value = await window.electronAPI.updater.getDistributionType()
      }
      if (window.electronAPI?.updater?.getLastCheckResult) {
        const lastResult = await window.electronAPI.updater.getLastCheckResult()
        if (lastResult?.hasUpdate && lastResult.latestVersion) {
          hasUpdateAvailable.value = true
          latestVersion.value = lastResult.latestVersion.replace(/^v/, '')
          releaseNotes.value = lastResult.releaseNotes || ''
          releaseDate.value = lastResult.releaseDate || ''
          updateStatus.value = 'available'
        } else {
          hasUpdateAvailable.value = false
        }
      }
      if (window.electronAPI?.updater?.getUpdateState) {
        const state = await window.electronAPI.updater.getUpdateState()
        if (state.isDownloaded) {
          updateStatus.value = 'downloaded'
        } else if (state.isDownloading) {
          errorContext.value = 'download'
          updateStatus.value = 'downloading'
        }
      }
    } catch (err) {
      console.warn('Failed to initialize updater state:', err)
    }
  }

  const checkForUpdates = async (manual = true): Promise<void> => {
    if (updateStatus.value === 'checking' || updateStatus.value === 'downloading') return
    if (updateStatus.value === 'available' || updateStatus.value === 'downloaded') {
      void doUpdate()
      return
    }
    if (resetStatusTimer) {
      clearTimeout(resetStatusTimer)
      resetStatusTimer = null
    }

    isManualCheck.value = manual
    updateStatus.value = 'checking'
    errorMessage.value = ''

    try {
      const res = await window.electronAPI.updater.checkForUpdates()
      distributionType.value = res.distributionType
      if (res.hasUpdate && res.latestVersion) {
        latestVersion.value = res.latestVersion.replace(/^v/, '')
        releaseNotes.value = res.releaseNotes || ''
        releaseDate.value = res.releaseDate || ''
        hasUpdateAvailable.value = true
        updateStatus.value = 'available'
      } else if (res.error) {
        errorContext.value = 'check'
        errorMessage.value = res.error
        updateStatus.value = 'error'
      } else {
        hasUpdateAvailable.value = false
        latestVersion.value = ''
        releaseNotes.value = ''
        releaseDate.value = ''
        if (manual) {
          updateStatus.value = 'up-to-date'
          if (resetStatusTimer) clearTimeout(resetStatusTimer)
          resetStatusTimer = setTimeout(() => {
            if (updateStatus.value === 'up-to-date') {
              updateStatus.value = 'idle'
            }
          }, 4000)
        } else {
          updateStatus.value = 'idle'
        }
      }
    } catch (err) {
      console.error('Check for updates failed:', err)
      errorContext.value = 'check'
      errorMessage.value = err instanceof Error ? err.message : String(err)
      updateStatus.value = 'error'
    } finally {
      if (!manual) {
        isManualCheck.value = false
      }
    }
  }

  const doUpdate = async (): Promise<void> => {
    if (!distributionType.value) {
      try {
        distributionType.value = await window.electronAPI.updater.getDistributionType()
      } catch {
        distributionType.value = 'win-portable'
      }
    }

    if (distributionType.value === 'win-portable' || distributionType.value === 'linux-other') {
      await window.electronAPI.updater.openReleasePage(latestVersion.value || undefined)
      return
    }

    errorContext.value = 'download'
    updateStatus.value = 'downloading'
    errorMessage.value = ''

    try {
      if (distributionType.value === 'linux-appimage') {
        const res = await window.electronAPI.updater.downloadLinuxAppImage(latestVersion.value)
        if (!res.success) {
          errorContext.value = 'download'
          errorMessage.value = res.message || ''
          updateStatus.value = 'error'
        }
      } else {
        const res = await window.electronAPI.updater.downloadUpdate()
        if (!res.success) {
          errorContext.value = 'download'
          errorMessage.value = res.message || ''
          updateStatus.value = 'error'
        }
      }
    } catch (err) {
      console.error('Download update failed:', err)
      errorContext.value = 'download'
      errorMessage.value = err instanceof Error ? err.message : String(err)
      updateStatus.value = 'error'
    }
  }

  const installUpdate = async (): Promise<void> => {
    try {
      const state = await window.electronAPI.download.getState()
      const { downloadingCount, waitingCount } = state.runtime
      if (downloadingCount > 0 || waitingCount > 0) {
        const pendingCount = downloadingCount + waitingCount
        const confirmed = await window.electronAPI.updater.showInstallConfirm({
          title: t('updater.installConflictTitle'),
          message: t('updater.installConflictMsg', { count: pendingCount }),
          detail: t('updater.installConflictDetail'),
          confirmLabel: t('updater.installConflictConfirm'),
          cancelLabel: t('updater.cancel')
        })
        if (!confirmed) return
      }
    } catch (err) {
      console.warn('Failed to verify download queue state before installing update:', err)
      const confirmed = await window.electronAPI.updater.showInstallConfirm({
        title: t('updater.installConflictTitle'),
        message: t('updater.installConflictDetail'),
        detail: err instanceof Error ? err.message : String(err),
        confirmLabel: t('updater.installConflictConfirm'),
        cancelLabel: t('updater.cancel')
      })
      if (!confirmed) return
    }
    window.electronAPI.updater.installUpdate()
  }

  const teardown = (): void => {
    if (resetStatusTimer) {
      clearTimeout(resetStatusTimer)
      resetStatusTimer = null
    }
    if (unsubscribeListener) {
      unsubscribeListener()
      unsubscribeListener = null
    }
    isInitialized = false
  }

  return {
    updateStatus,
    hasUpdateAvailable,
    latestVersion,
    distributionType,
    updateProgress,
    releaseNotes,
    releaseDate,
    errorMessage,
    errorContext,
    isInstaller,
    isPortableOrOther,
    formattedReleaseDate,
    formattedTransferred,
    formattedSpeed,
    distributionLabel,
    initialize,
    checkForUpdates,
    doUpdate,
    installUpdate,
    teardown
  }
}
