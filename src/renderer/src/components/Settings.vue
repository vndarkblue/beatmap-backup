<template>
  <AppViewShell :title="$t('settings.title')" :lang="currentLocale">
    <div class="settings-container">
      <!-- Segmented Tabs Header -->
      <div class="settings-tabs-wrapper mb-6">
        <v-tabs
          v-model="activeTab"
          color="primary"
          align-tabs="center"
          class="settings-tabs"
          density="comfortable"
          hide-slider
        >
          <v-tab value="paths" prepend-icon="$cogOutline">
            {{ $t('settings.general') }}
          </v-tab>
          <v-tab value="download" prepend-icon="$downloadOutline">
            {{ $t('settings.downloadTab') }}
          </v-tab>
          <v-tab value="database" prepend-icon="$databaseOutline">
            {{ $t('settings.database.title') }}
          </v-tab>
          <v-tab value="about" prepend-icon="$informationOutline">
            {{ $t('settings.about.title') || 'Thông tin' }}
          </v-tab>
        </v-tabs>
      </div>

      <!-- Tab Content Window -->
      <v-window v-model="activeTab" class="settings-window">
        <!-- 1. Paths & General Settings -->
        <v-window-item value="paths">
          <SettingsPathsCard
            v-model:model-value-stable="osuStablePath"
            v-model:model-value-lazer="osuLazerPath"
            v-model:current-locale="currentLocale"
            :osu-lazer-resolved-data-path="osuLazerResolvedDataPath"
            :osu-stable-placeholder="osuStablePlaceholder"
            :osu-lazer-placeholder="osuLazerPlaceholder"
            :show-auto-detect-warning-inline="showAutoDetectWarningInline"
            :is-general-default="isGeneralDefault"
            :is-resetting="isResetting"
            :available-locales="availableLocales"
            @select-stable-path="selectOsuStablePath"
            @select-lazer-path="selectOsuLazerPath"
            @reset-general="resetGeneralSettings"
          />
        </v-window-item>

        <!-- 2. Download Settings -->
        <v-window-item value="download">
          <SettingsDownloadCard
            v-model:model-value-thread-count="threadCount"
            v-model:model-value-remove-from-stable="removeFromStable"
            v-model:model-value-remove-from-lazer="removeFromLazer"
            v-model:model-value-no-video="noVideo"
            v-model:model-value-wait-for-downloads-on-pause="waitForDownloadsOnPause"
            :thread-count-label="threadCountLabel"
            :is-download-default="isDownloadDefault"
            :is-resetting="isResetting"
            :is-stable-path-valid="isStablePathValid"
            :is-lazer-path-valid="isLazerPathValid"
            :wait-for-downloads-help-text="waitForDownloadsHelpText"
            :current-locale="currentLocale"
            :has-beatconnect-token="hasBeatconnectToken"
            :mirror-statuses="mirrorStatuses"
            :is-loading-mirrors="isLoadingMirrors"
            @reset-download="resetDownloadSettings"
            @save-beatconnect-token="saveBeatconnectToken"
            @clear-beatconnect-token="clearBeatconnectToken"
            @refresh-mirrors="loadMirrorsStatus"
          />
        </v-window-item>

        <!-- 3. Database Status & Sync -->
        <v-window-item value="database">
          <SettingsDatabaseCard
            :database-status="databaseStatus"
            :stable-status="stableStatus"
            :lazer-status="lazerStatus"
            :format-sync-time="formatSyncTime"
            :is-syncing="isSyncing"
            :sync-message="syncMessage"
            :sync-message-is-error="syncMessageIsError"
            :can-sync-database="canSyncDatabase"
            :current-locale="currentLocale"
            @trigger-sync="triggerDatabaseSync"
          />
        </v-window-item>

        <!-- 4. About & Updates -->
        <v-window-item value="about">
          <SettingsAboutCard :current-locale="currentLocale" />
          <v-row class="mt-4">
            <v-col cols="12" md="6">
              <SettingsDiagnosticCard :current-locale="currentLocale" />
            </v-col>
            <v-col cols="12" md="6">
              <SettingsResetCard
                :current-locale="currentLocale"
                :reset-feedback-message="resetFeedbackMessage"
                :reset-feedback-class="resetFeedbackClass"
                :show-reset-all-confirm="showResetAllConfirm"
                :is-resetting="isResetting"
                :confirm-hold-style="confirmHoldStyle"
                @cancel-reset-all="cancelResetAllConfirm"
                @request-reset-all="requestResetAllConfirm"
                @start-reset-all-hold="startResetAllHold"
                @cancel-reset-all-hold="cancelResetAllHold"
              />
            </v-col>
          </v-row>
        </v-window-item>
      </v-window>
    </div>
  </AppViewShell>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  FRONTEND_DEFAULTS,
  FRONTEND_TIMINGS_MS,
  STORAGE_KEYS
} from '../../../config/frontendConstants'
import { languageNames, languageFlags } from '../i18n/languageProperties'
import { useDownloadSettings } from '../composables/useDownloadSettings'
import AppViewShell from './common/AppViewShell.vue'
import SettingsPathsCard from './settings/SettingsPathsCard.vue'
import SettingsDownloadCard from './settings/SettingsDownloadCard.vue'
import SettingsDatabaseCard from './settings/SettingsDatabaseCard.vue'
import SettingsAboutCard from './settings/SettingsAboutCard.vue'
import SettingsDiagnosticCard from './settings/SettingsDiagnosticCard.vue'
import SettingsResetCard from './settings/SettingsResetCard.vue'
import type { DatabaseStatus } from '../../../services/database/types'
import type { MirrorStatus } from '../../../preload/electronApiTypes'
import { getDatabaseSourceStatus, canSyncDatabaseSource } from '../utils/databaseStatus'

const { t, locale } = useI18n()
const activeTab = ref('paths')

// General Settings
const osuStablePath = ref('')
const osuLazerPath = ref('')
const osuLazerResolvedDataPath = ref('')

// Download settings from composable
const {
  threadCount,
  removeFromStable,
  removeFromLazer,
  noVideo,
  waitForDownloadsOnPause,
  load: loadDownloadSettings
} = useDownloadSettings()

// Computed properties
const availableLocales = computed(() =>
  Object.entries(languageNames).map(([value, text]) => ({
    value,
    text,
    flagCode: languageFlags[value as keyof typeof languageFlags]
  }))
)

const currentLocale = computed({
  get: () => locale.value,
  set: (value: string) => {
    locale.value = value
    localStorage.setItem(STORAGE_KEYS.LOCALE, value)
    document.documentElement.lang = value
  }
})

const threadCountLabel = computed(() => {
  return `${t('settings.downloadOptions.threadCount')}: ${threadCount.value}`
})
const waitForDownloadsHelpText = computed(() =>
  waitForDownloadsOnPause.value
    ? t('settings.downloadOptions.waitForDownloadsHelpOn')
    : t('settings.downloadOptions.waitForDownloadsHelpOff')
)

const isStablePathValid = computed(() => !!osuStablePath.value)
const isLazerPathValid = computed(() => !!osuLazerPath.value)
const isWindows = computed(() => navigator.userAgent.toLowerCase().includes('windows'))
const osuStablePlaceholder = computed(() =>
  isWindows.value ? 'C:\\Users\\<you>\\AppData\\Local\\osu!' : ''
)
const osuLazerPlaceholder = computed(() =>
  isWindows.value ? 'C:\\Users\\<you>\\AppData\\Local\\osu' : ''
)
const showAutoDetectWarningInline = ref(false)
let autoDetectWarningTimer: number | null = null

const databaseStatus = ref<DatabaseStatus | null>(null)
const stableStatus = computed(() =>
  getDatabaseSourceStatus(databaseStatus.value?.stable, osuStablePath.value)
)
const lazerStatus = computed(() =>
  getDatabaseSourceStatus(databaseStatus.value?.lazer, osuLazerPath.value)
)
const canSyncDatabase = computed(
  () =>
    canSyncDatabaseSource(databaseStatus.value?.stable, osuStablePath.value) ||
    canSyncDatabaseSource(databaseStatus.value?.lazer, osuLazerPath.value)
)
const isSyncing = ref(false)
const syncMessage = ref('')
const syncMessageIsError = ref(false)
const isResetting = ref(false)
const showResetAllConfirm = ref(false)
const resetHoldProgress = ref(0)
const resetFeedbackMessage = ref('')
const resetFeedbackClass = ref('')
let resetHoldRaf: number | null = null
let resetHoldStartedAt = 0
let isResetHoldActive = false
let unsubscribeDatabaseSync: (() => void) | null = null
const RESET_HOLD_MS = 727

const loadSettings = async (): Promise<void> => {
  try {
    const data = await window.electronAPI.settings.get()
    osuStablePath.value = data.osuStablePath || ''
    osuLazerPath.value = data.osuLazerPath || ''
    osuLazerResolvedDataPath.value = data.osuLazerResolvedDataPath || ''
    loadDownloadSettings()
  } catch (error) {
    console.error('Failed to load settings:', error)
    loadDownloadSettings()
  }
}

const loadDatabaseStatus = async (): Promise<void> => {
  try {
    databaseStatus.value = await window.electronAPI.database.getStatus()
  } catch (error) {
    console.error('Failed to load database status:', error)
  }
}

const loadAutoDetectWarning = async (): Promise<void> => {
  try {
    const data = await window.electronAPI.settings.getAutoDetectStatus()
    if (!data.showWarning) return
    showAutoDetectWarningInline.value = true
    if (autoDetectWarningTimer) {
      window.clearTimeout(autoDetectWarningTimer)
    }
    autoDetectWarningTimer = window.setTimeout(() => {
      showAutoDetectWarningInline.value = false
      autoDetectWarningTimer = null
    }, FRONTEND_TIMINGS_MS.AUTO_DETECT_WARNING_HIDE)
  } catch (error) {
    console.error('Failed to load auto-detect warning state:', error)
  }
}

const hasBeatconnectToken = ref(false)
const mirrorStatuses = ref<MirrorStatus[]>([])
const isLoadingMirrors = ref(false)

const loadBeatconnectTokenStatus = async (): Promise<void> => {
  try {
    hasBeatconnectToken.value = await window.electronAPI.settings.hasBeatconnectToken()
  } catch (error) {
    console.error('Failed to load BeatConnect token status:', error)
  }
}

const saveBeatconnectToken = async (token: string): Promise<void> => {
  try {
    await window.electronAPI.settings.setBeatconnectToken(token)
    hasBeatconnectToken.value = !!token
    await loadMirrorsStatus()
  } catch (error) {
    console.error('Failed to save BeatConnect token:', error)
  }
}

const clearBeatconnectToken = async (): Promise<void> => {
  try {
    await window.electronAPI.settings.setBeatconnectToken('')
    hasBeatconnectToken.value = false
    await loadMirrorsStatus()
  } catch (error) {
    console.error('Failed to clear BeatConnect token:', error)
  }
}

const loadMirrorsStatus = async (): Promise<void> => {
  isLoadingMirrors.value = true
  try {
    mirrorStatuses.value = await window.electronAPI.system.getMirrorsStatus()
  } catch (error) {
    console.error('Failed to load mirrors status:', error)
  } finally {
    isLoadingMirrors.value = false
  }
}

const saveOsuStablePath = async (path: string): Promise<void> => {
  await window.electronAPI.settings.update({ osuStablePath: path })
}

const saveOsuLazerPath = async (path: string): Promise<void> => {
  await window.electronAPI.settings.update({ osuLazerPath: path })
}

const selectOsuStablePath = async (): Promise<void> => {
  const dir = await window.electronAPI.system.selectDirectory()
  if (!dir) return
  const validation = await window.electronAPI.settings.validatePath('stable', dir)
  if (validation.valid) {
    osuStablePath.value = dir
    await saveOsuStablePath(dir)
    await loadSettings()
    await loadDatabaseStatus()
  } else {
    alert(t('settings.errors.invalidStablePath'))
  }
}

const selectOsuLazerPath = async (): Promise<void> => {
  const dir = await window.electronAPI.system.selectDirectory()
  if (!dir) return
  const validation = await window.electronAPI.settings.validatePath('lazer', dir)
  if (validation.valid) {
    osuLazerPath.value = dir
    await saveOsuLazerPath(dir)
    await loadSettings()
    await loadDatabaseStatus()
  } else {
    alert(t('settings.errors.realmNotFound'))
  }
}

const formatSyncTime = (timestamp: number | null): string => {
  if (!timestamp) return t('settings.database.never')
  return new Date(timestamp).toLocaleString()
}

const ensureDatabaseEvents = (): void => {
  if (unsubscribeDatabaseSync) return
  unsubscribeDatabaseSync = window.electronAPI.database.onSyncProgress((progress) => {
    if (progress.phase === 'started') {
      isSyncing.value = true
      syncMessageIsError.value = false
    } else if (progress.phase === 'progress') {
      syncMessage.value = progress.error || progress.message || ''
      void loadDatabaseStatus()
    } else if (progress.phase === 'completed' || progress.phase === 'skipped') {
      isSyncing.value = false
      syncMessage.value = ''
      syncMessageIsError.value = false
      void loadDatabaseStatus()
    } else if (progress.phase === 'error') {
      isSyncing.value = false
      syncMessage.value = progress.error || progress.message || ''
      syncMessageIsError.value = true
      void loadDatabaseStatus()
    }
  })
}

const triggerDatabaseSync = async (): Promise<void> => {
  isSyncing.value = true
  syncMessageIsError.value = false
  syncMessage.value = t('settings.database.syncing')
  await window.electronAPI.database.sync({ source: 'all', force: true })
}

const isGeneralDefault = computed(() => {
  return !osuStablePath.value && !osuLazerPath.value && locale.value === FRONTEND_DEFAULTS.LOCALE
})

const isDownloadDefault = computed(() => {
  return (
    threadCount.value === FRONTEND_DEFAULTS.THREAD_COUNT &&
    removeFromStable.value === false &&
    removeFromLazer.value === false &&
    noVideo.value === false &&
    waitForDownloadsOnPause.value === true
  )
})

const resetGeneralSettings = async (): Promise<void> => {
  if (isResetting.value) return
  isResetting.value = true
  try {
    await window.electronAPI.settings.update({ osuStablePath: '', osuLazerPath: '' })
    osuStablePath.value = ''
    osuLazerPath.value = ''
    currentLocale.value = FRONTEND_DEFAULTS.LOCALE
    await loadDatabaseStatus()
  } catch (error) {
    console.error('Failed to reset general settings:', error)
  } finally {
    isResetting.value = false
  }
}

const resetDownloadSettings = (): void => {
  if (isResetting.value) return
  threadCount.value = FRONTEND_DEFAULTS.THREAD_COUNT
  removeFromStable.value = false
  removeFromLazer.value = false
  noVideo.value = false
  waitForDownloadsOnPause.value = true
}

const confirmHoldStyle = computed(() =>
  showResetAllConfirm.value
    ? ({ '--hold-progress': `${resetHoldProgress.value}%` } as Record<string, string>)
    : undefined
)

const clearResetHoldRaf = (): void => {
  if (resetHoldRaf !== null) {
    window.cancelAnimationFrame(resetHoldRaf)
    resetHoldRaf = null
  }
}

const cancelResetAllHold = (): void => {
  isResetHoldActive = false
  clearResetHoldRaf()
  if (!isResetting.value) {
    resetHoldProgress.value = 0
  }
}

const requestResetAllConfirm = (): void => {
  if (showResetAllConfirm.value) return
  showResetAllConfirm.value = true
  resetHoldProgress.value = 0
  resetFeedbackMessage.value = ''
}

const cancelResetAllConfirm = (): void => {
  showResetAllConfirm.value = false
  cancelResetAllHold()
}

const startResetAllHold = (): void => {
  if (!showResetAllConfirm.value || isResetting.value || isResetHoldActive) return
  isResetHoldActive = true
  resetHoldStartedAt = performance.now()
  const tick = (now: number): void => {
    if (!isResetHoldActive || isResetting.value) return
    const elapsed = now - resetHoldStartedAt
    const progress = Math.min(100, (elapsed / RESET_HOLD_MS) * 100)
    resetHoldProgress.value = progress
    if (progress >= 100) {
      resetHoldProgress.value = 100
      isResetHoldActive = false
      clearResetHoldRaf()
      void performResetAllSettings()
      return
    }
    resetHoldRaf = window.requestAnimationFrame(tick)
  }
  resetHoldRaf = window.requestAnimationFrame(tick)
}

const performResetAllSettings = async (): Promise<void> => {
  if (isResetting.value) return
  isResetting.value = true
  try {
    await window.electronAPI.settings.reset()

    localStorage.removeItem(STORAGE_KEYS.DOWNLOAD_SETTINGS)
    localStorage.removeItem(STORAGE_KEYS.BACKUP_TOGGLE_STATE)
    localStorage.removeItem(STORAGE_KEYS.BACKUP_COLLECTION_PREVIEW_SNAPSHOT)
    localStorage.setItem(STORAGE_KEYS.LOCALE, FRONTEND_DEFAULTS.LOCALE)
    document.documentElement.lang = FRONTEND_DEFAULTS.LOCALE

    await loadSettings()
    await loadDatabaseStatus()
    hasBeatconnectToken.value = false
    await loadMirrorsStatus()
    resetFeedbackClass.value = 'text-success'
    resetFeedbackMessage.value = t('settings.reset.success')
    showResetAllConfirm.value = false
  } catch (error) {
    console.error('Failed to reset all settings:', error)
    resetFeedbackClass.value = 'text-error'
    resetFeedbackMessage.value = t('settings.reset.error')
  } finally {
    isResetting.value = false
    cancelResetAllHold()
  }
}

watch([osuStablePath, osuLazerPath], () => {
  void loadDatabaseStatus()
})

onMounted(async () => {
  await loadSettings()
  await loadDatabaseStatus()
  await loadAutoDetectWarning()
  await loadBeatconnectTokenStatus()
  await loadMirrorsStatus()
  ensureDatabaseEvents()
})

onBeforeUnmount(() => {
  clearResetHoldRaf()
  if (autoDetectWarningTimer) {
    window.clearTimeout(autoDetectWarningTimer)
    autoDetectWarningTimer = null
  }
  if (unsubscribeDatabaseSync) {
    unsubscribeDatabaseSync()
    unsubscribeDatabaseSync = null
  }
})
</script>

<style scoped>
.settings-container {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
}

.settings-tabs-wrapper {
  display: flex;
  justify-content: center;
}

.settings-tabs {
  --v-tabs-height: 36px;
  height: auto !important;
  min-height: auto !important;
  background: var(--card-bg-color) !important;
  border: 1px solid var(--card-border-color) !important;
  border-radius: 12px !important;
  padding: 4px !important;
  backdrop-filter: blur(12px);
  display: inline-flex !important;
}

.settings-tabs :deep(.v-slide-group__container) {
  height: auto !important;
  contain: none !important;
}

.settings-tabs :deep(.v-slide-group__content) {
  height: 100% !important;
  display: flex !important;
  align-items: center !important;
}

.settings-tabs :deep(.v-tab) {
  height: 36px !important;
  min-height: 36px !important;
  border-radius: 8px !important;
  text-transform: uppercase;
  font-weight: 600;
  font-size: 0.825rem;
  letter-spacing: 0.04em;
  transition: all 0.2s ease;
  margin: 0 2px;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.settings-tabs :deep(.v-tab:not(.v-tab--selected)) {
  color: rgba(var(--v-theme-on-surface), 0.7) !important;
}

.settings-tabs :deep(.v-tab:hover:not(.v-tab--selected)) {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgba(var(--v-theme-on-surface), 0.95) !important;
}

.settings-tabs :deep(.v-tab--selected) {
  background: rgba(var(--v-theme-primary), 0.15) !important;
  color: rgb(var(--v-theme-primary)) !important;
}

.settings-tabs :deep(.v-btn__content) {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.settings-tabs :deep(.v-btn__prepend) {
  display: inline-flex;
  align-items: center;
  margin-inline-end: 8px;
}

.settings-window {
  width: 100%;
}
</style>
