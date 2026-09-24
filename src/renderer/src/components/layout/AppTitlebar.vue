<template>
  <header class="app-titlebar">
    <!-- Draggable title & branding section -->
    <div class="titlebar-drag-region">
      <div class="titlebar-branding">
        <img :src="logoUrl" alt="Logo" class="titlebar-logo" />
        <span class="titlebar-app-name">Beatmap Backup</span>
        <span v-if="appVersion" class="titlebar-version-badge"
          >v{{ appVersion.replace(/^v/, '') }}</span
        >
      </div>
    </div>

    <!-- Non-draggable Window Control Buttons -->
    <div class="titlebar-controls">
      <button
        type="button"
        class="update-pill"
        :class="pillClass"
        :title="pillTitle"
        @click="handlePillClick"
      >
        <span class="update-pill-icon-host">
          <v-progress-circular
            v-if="updateStatus === 'checking'"
            indeterminate
            size="14"
            width="2"
            color="currentColor"
          />
          <v-progress-circular
            v-else-if="isDownloading"
            :model-value="updateProgress?.percent ?? 0"
            :indeterminate="!updateProgress?.percent"
            size="14"
            width="2"
            color="currentColor"
          />
          <v-icon v-else :icon="pillIcon" size="16" />
        </span>

        <span class="update-pill-label">{{ pillLabel }}</span>

        <span v-if="showNotifDot" class="update-notif-dot"></span>
      </button>

      <div class="titlebar-control-separator"></div>

      <button type="button" class="titlebar-btn titlebar-btn-minimize" @click="minimizeWindow">
        <v-icon icon="$windowMinimize" size="16" />
      </button>

      <button type="button" class="titlebar-btn titlebar-btn-maximize" @click="maximizeWindow">
        <v-icon :icon="isMaximized ? '$windowRestore' : '$windowMaximize'" size="14" />
      </button>

      <button type="button" class="titlebar-btn titlebar-btn-close" @click="closeWindow">
        <v-icon icon="$close" size="16" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import logoUrl from '../../assets/logo.png'
import type {
  AppDistributionType,
  UpdateDownloadProgress
} from '../../../../preload/electronApiTypes'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

const props = withDefaults(
  defineProps<{
    hasUpdateAvailable?: boolean
    updateStatus?: UpdateStatus
    errorContext?: 'check' | 'download'
    distributionType?: AppDistributionType | null
    latestVersion?: string
    updateProgress?: UpdateDownloadProgress
  }>(),
  {
    hasUpdateAvailable: false,
    updateStatus: 'idle',
    errorContext: 'check',
    distributionType: null,
    latestVersion: '',
    updateProgress: () => ({ percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 })
  }
)

const emit = defineEmits<{
  (e: 'check-updates'): void
  (e: 'do-update'): void
  (e: 'install-update'): void
}>()

const { t } = useI18n()
const appVersion = ref('')
const isMaximized = ref(false)
let cleanupMaximizeListener: (() => void) | null = null

const isDownloading = computed(() => props.updateStatus === 'downloading')
const isInstaller = computed(() => props.distributionType === 'win-installer')
const isPortableOrOther = computed(
  () => props.distributionType === 'win-portable' || props.distributionType === 'linux-other'
)

const showNotifDot = computed(
  () =>
    (props.hasUpdateAvailable || props.updateStatus === 'available') &&
    props.updateStatus === 'idle'
)

const pillClass = computed(() => ({
  'is-available': props.updateStatus === 'available',
  'is-checking': props.updateStatus === 'checking',
  'is-up-to-date': props.updateStatus === 'up-to-date',
  'is-downloading': props.updateStatus === 'downloading',
  'is-downloaded': props.updateStatus === 'downloaded',
  'is-error': props.updateStatus === 'error'
}))

const pillIcon = computed(() => {
  switch (props.updateStatus) {
    case 'up-to-date':
      return '$checkCircle'
    case 'available':
      return isPortableOrOther.value ? '$export' : '$update'
    case 'downloaded':
      return isInstaller.value ? '$refresh' : '$checkCircle'
    case 'error':
      return '$alertCircle'
    default:
      return '$update'
  }
})

const pillLabel = computed(() => {
  switch (props.updateStatus) {
    case 'checking':
      return t('updater.checkingShort')
    case 'up-to-date':
      return t('updater.upToDateShort')
    case 'available': {
      const actionText = isPortableOrOther.value
        ? t('updater.goToRelease')
        : t('updater.downloadNow')
      const cleanVer = props.latestVersion ? props.latestVersion.replace(/^v/, '') : ''
      return cleanVer ? `v${cleanVer} · ${actionText}` : actionText
    }
    case 'downloading':
      return `${Math.round(props.updateProgress?.percent ?? 0)}%`
    case 'downloaded':
      return isInstaller.value ? t('updater.relaunchInstall') : t('updater.downloadedShort')
    case 'error':
      return props.errorContext === 'download'
        ? t('updater.downloadErrorRetry')
        : t('updater.errorRetry')
    default:
      return t('updater.checkUpdate')
  }
})

const pillTitle = computed(() => {
  if (props.updateStatus === 'idle') {
    return t('updater.checkUpdate')
  }
  return pillLabel.value
})

const handlePillClick = (): void => {
  if (props.updateStatus === 'downloaded' && isInstaller.value) {
    emit('install-update')
  } else if (props.updateStatus === 'available' || props.updateStatus === 'downloaded') {
    emit('do-update')
  } else if (props.updateStatus === 'error') {
    if (props.errorContext === 'download') {
      emit('do-update')
    } else {
      emit('check-updates')
    }
  } else if (props.updateStatus !== 'checking' && props.updateStatus !== 'downloading') {
    emit('check-updates')
  }
}

const minimizeWindow = (): void => {
  window.electronAPI?.windowControls?.minimize()
}

const maximizeWindow = (): void => {
  window.electronAPI?.windowControls?.maximize()
}

const closeWindow = (): void => {
  window.electronAPI?.windowControls?.close()
}

onMounted(async () => {
  try {
    if (window.electronAPI?.updater?.getAppVersion) {
      appVersion.value = await window.electronAPI.updater.getAppVersion()
    }
    if (window.electronAPI?.windowControls?.isMaximized) {
      isMaximized.value = await window.electronAPI.windowControls.isMaximized()
    }
    if (window.electronAPI?.windowControls?.onMaximizeChange) {
      cleanupMaximizeListener = window.electronAPI.windowControls.onMaximizeChange((maximized) => {
        isMaximized.value = maximized
      })
    }
  } catch (err) {
    console.error('Failed to initialize titlebar controls:', err)
  }
})

onBeforeUnmount(() => {
  if (cleanupMaximizeListener) {
    cleanupMaximizeListener()
    cleanupMaximizeListener = null
  }
})
</script>

<style scoped>
.app-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  width: 100%;
  background-color: var(--titlebar-bg-color);
  border-bottom: 1px solid var(--card-border-color);
  user-select: none;
  z-index: 1000;
  position: relative;
  flex-shrink: 0;
}

.titlebar-drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  height: 100%;
  padding-left: 14px;
  -webkit-app-region: drag;
}

.titlebar-branding {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-default) !important;
}

.titlebar-logo {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  pointer-events: none;
}

.titlebar-app-name {
  font-family: var(--font-default) !important;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--main-text-color);
}

.titlebar-version-badge {
  font-family: var(--font-default) !important;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 9999px;
  background-color: rgba(255, 102, 170, 0.12);
  color: var(--accent-pink);
  border: 1px solid rgba(255, 102, 170, 0.25);
  line-height: 1.4;
}

.titlebar-controls {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
}

/* Update Pill Button */
.update-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0;
  height: 26px;
  max-width: 28px;
  border-radius: 13px;
  padding: 0 6px;
  overflow: hidden;
  border: none;
  background: transparent;
  color: var(--text-muted-color);
  cursor: pointer;
  outline: none;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.22s ease;
  white-space: nowrap;
}

.update-pill-icon-host {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* Hover expansion in idle state */
.update-pill:hover {
  max-width: 240px;
  padding: 0 10px;
  background-color: rgba(255, 102, 170, 0.12);
  color: var(--accent-pink);
}

/* Active states (expanded without hover) */
.update-pill.is-available {
  max-width: 260px;
  padding: 0 10px;
  background-color: rgba(255, 102, 170, 0.12);
  color: var(--accent-pink);
}

.update-pill.is-checking {
  max-width: 220px;
  padding: 0 10px;
  background-color: rgba(127, 127, 127, 0.1);
  color: var(--text-muted-color);
}

.update-pill.is-up-to-date {
  max-width: 220px;
  padding: 0 10px;
  background-color: rgba(52, 211, 153, 0.14);
  color: var(--accent-green);
}

.update-pill.is-downloading {
  max-width: 160px;
  padding: 0 10px;
  background-color: rgba(255, 102, 170, 0.12);
  color: var(--accent-pink);
}

.update-pill.is-downloaded {
  max-width: 240px;
  padding: 0 10px;
  background-color: rgba(255, 102, 170, 0.16);
  color: var(--accent-pink);
}

.update-pill.is-error {
  max-width: 240px;
  padding: 0 10px;
  background-color: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

/* Label transition */
.update-pill-label {
  font-family: var(--font-family) !important;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  max-width: 0;
  opacity: 0;
  margin-left: 0;
  position: relative;
  top: 0;
  transition:
    max-width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.18s ease,
    margin-left 0.22s ease;
}

:root[lang='ja'] .update-pill-label,
html[lang='ja'] .update-pill-label,
body[lang='ja'] .update-pill-label,
.v-application[lang='ja'] .update-pill-label,
[lang='ja'] .update-pill-label {
  top: -1px;
}

.update-pill:hover .update-pill-label,
.update-pill.is-available .update-pill-label,
.update-pill.is-checking .update-pill-label,
.update-pill.is-up-to-date .update-pill-label,
.update-pill.is-downloading .update-pill-label,
.update-pill.is-downloaded .update-pill-label,
.update-pill.is-error .update-pill-label {
  max-width: 200px;
  opacity: 1;
  margin-left: 6px;
}

/* Pulsing Notification Dot (idle badge) */
.update-notif-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--accent-pink);
  animation: pulse-dot 2s ease-in-out infinite;
}

.update-pill:hover .update-notif-dot,
.update-pill.is-available .update-notif-dot,
.update-pill.is-checking .update-notif-dot,
.update-pill.is-up-to-date .update-notif-dot,
.update-pill.is-downloading .update-notif-dot,
.update-pill.is-downloaded .update-notif-dot,
.update-pill.is-error .update-notif-dot {
  display: none;
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

.titlebar-control-separator {
  width: 1px;
  height: 16px;
  background-color: var(--card-border-color);
  margin: 0 6px;
  opacity: 0.7;
}

.titlebar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--text-muted-color);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  cursor: pointer;
  padding: 0;
  margin: 0;
  outline: none;
}

.titlebar-btn:hover {
  background-color: rgba(127, 127, 127, 0.12);
  color: var(--main-text-color);
}

.titlebar-btn-close:hover {
  background-color: #e81123 !important;
  color: #ffffff !important;
}
</style>
