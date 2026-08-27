<template>
  <AppViewShell :title="$t('settings.title')" :lang="currentLocale">
    <!-- General Settings Section -->
    <AppIsland card-class="mb-4" icon="$cogOutline">
      <template #title>
        <div class="d-flex align-center justify-space-between w-100">
          <span>{{ $t('settings.general') }}</span>
          <v-btn
            icon="$restore"
            variant="text"
            size="small"
            :lang="currentLocale"
            :disabled="isGeneralDefault || isResetting"
            :title="$t('settings.reset.general')"
            @click="resetGeneralSettings"
          />
        </div>
      </template>
      <AppForm>
        <PathField
          v-model="osuStablePath"
          mode="directory"
          :label="$t('settings.osuStablePath')"
          :browse-title="$t('settings.selectFolder')"
          :placeholder="osuStablePlaceholder"
          @browse="selectOsuStablePath"
        />

        <PathField
          v-model="osuLazerPath"
          mode="directory"
          :label="$t('settings.osuLazerPath')"
          :browse-title="$t('settings.selectFolder')"
          :placeholder="osuLazerPlaceholder"
          @browse="selectOsuLazerPath"
        />
        <v-alert
          v-if="showAutoDetectWarningInline"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-n2 mb-2"
          :text="$t('notifications.paths.autoDetectFailed')"
        />
      </AppForm>
      <v-divider></v-divider>
      <!-- Language Selection -->
      <v-select
        v-model="currentLocale"
        :items="availableLocales"
        :label="$t('language.title')"
        prepend-icon="$translate"
        item-title="text"
        item-value="value"
        class="view-field"
        :lang="currentLocale"
      >
        <template #item="{ props, item }">
          <v-list-item v-bind="props" :title="undefined" :lang="item.raw.value">
            <template #prepend>
              <span :class="`fi fi-${item.raw.flagCode}`" class="flag-icon"></span>
            </template>
            {{ item.raw.text }}
          </v-list-item>
        </template>
        <template #selection="{ item }">
          <span :class="`fi fi-${item.raw.flagCode}`" class="flag-icon"></span>
          <span class="ml-2" :lang="item.raw.value">{{ item.raw.text }}</span>
        </template>
      </v-select>
    </AppIsland>

    <!-- Download Settings Section -->
    <AppIsland card-class="mb-4" icon="$downloadOutline">
      <template #title>
        <div class="d-flex align-center justify-space-between w-100">
          <span>{{ $t('settings.download') }}</span>
          <v-btn
            icon="$restore"
            variant="text"
            size="small"
            :lang="currentLocale"
            :disabled="isDownloadDefault || isResetting"
            :title="$t('settings.reset.download')"
            @click="resetDownloadSettings"
          />
        </div>
      </template>
      <!-- Thread Count -->
      <div class="d-flex flex-column flex-sm-row align-sm-center mb-4">
        <div class="d-flex align-center mb-2 mb-sm-0 mr-sm-4 pb-6 ga-2" :lang="currentLocale">
          <span class="text-subtitle-1" :lang="currentLocale">{{ threadCountLabel }}</span>
          <v-tooltip location="top">
            <template #activator="{ props }">
              <v-icon v-bind="props" icon="$helpCircleOutline" size="18" color="medium-emphasis" />
            </template>
            <span :lang="currentLocale">{{ $t('download.options.threadCountHelp') }}</span>
          </v-tooltip>
        </div>
        <v-slider
          v-model="threadCount"
          :min="1"
          :max="10"
          :step="1"
          thumb-label
          class="view-field"
          :lang="currentLocale"
          color="primary"
        ></v-slider>
      </div>

      <!-- Two column layout for ignore existing and other options -->
      <div class="d-flex flex-column flex-sm-row">
        <!-- Ignore Existing Beatmaps Column -->
        <div class="flex-grow-1 pr-sm-4 mb-4 mb-sm-0">
          <div class="text-subtitle-1 mb-4 mt-1" :lang="currentLocale">
            {{ $t('download.options.ignoreExisting') }}
          </div>
          <v-checkbox
            v-model="removeFromStable"
            :label="$t('download.options.ignoreStable')"
            color="primary"
            hide-details
            class="view-field"
            :disabled="!isStablePathValid"
          ></v-checkbox>
          <v-checkbox
            v-model="removeFromLazer"
            :label="$t('download.options.ignoreLazer')"
            color="primary"
            hide-details
            class="view-field"
            :disabled="!isLazerPathValid"
          ></v-checkbox>
        </div>

        <v-divider vertical class="mx-4 d-none d-sm-flex"></v-divider>

        <!-- Other Options Column -->
        <div class="flex-grow-1">
          <div class="text-subtitle-1 mb-4 mt-1" :lang="currentLocale">
            {{ $t('download.options.other') }}
          </div>
          <v-switch
            v-model="noVideo"
            :label="$t('download.options.noVideo')"
            color="primary"
            hide-details
            class="view-field pl-2"
          ></v-switch>
          <v-switch
            v-model="waitForDownloadsOnPause"
            :label="$t('download.options.waitForDownloads')"
            color="primary"
            hide-details
            class="view-field pl-2"
          ></v-switch>
          <div class="text-caption mt-1 ml-2" :lang="currentLocale">
            {{ waitForDownloadsHelpText }}
          </div>
        </div>
      </div>
    </AppIsland>

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
          <span :class="databaseStatus?.stable.isDirty ? 'text-warning' : 'text-success'">
            {{
              databaseStatus?.stable.isDirty
                ? $t('settings.database.outOfDate')
                : $t('settings.database.upToDate')
            }}
          </span>
        </div>
        <div class="text-caption" :lang="currentLocale">
          {{ $t('settings.database.lastSync') }}:
          {{ formatSyncTime(databaseStatus?.stable.lastSyncAt ?? null) }}
        </div>
      </div>
      <div class="mb-4">
        <div class="text-subtitle-2 mb-1" :lang="currentLocale">
          {{ $t('settings.database.lazer') }}:
          <span :class="databaseStatus?.lazer.isDirty ? 'text-warning' : 'text-success'">
            {{
              databaseStatus?.lazer.isDirty
                ? $t('settings.database.outOfDate')
                : $t('settings.database.upToDate')
            }}
          </span>
        </div>
        <div class="text-caption" :lang="currentLocale">
          {{ $t('settings.database.lastSync') }}:
          {{ formatSyncTime(databaseStatus?.lazer.lastSyncAt ?? null) }}
        </div>
      </div>

      <v-progress-linear
        v-if="isSyncing"
        indeterminate
        color="primary"
        class="mb-3"
      ></v-progress-linear>

      <div v-if="syncMessage" class="text-caption mb-3" :lang="currentLocale">
        {{ syncMessage }}
      </div>

      <v-btn
        color="primary"
        :loading="isSyncing"
        :lang="currentLocale"
        @click="triggerDatabaseSync"
      >
        {{ $t('settings.database.syncNow') }}
      </v-btn>
    </AppIsland>

    <AppIsland card-class="mt-4" icon="$backupRestore">
      <template #title>
        <div class="d-flex align-center justify-space-between w-100">
          <span>{{ $t('settings.reset.all') }}</span>
        </div>
      </template>
      <div class="text-body-2 mb-2" :lang="currentLocale">{{ $t('settings.reset.warning') }}</div>
      <div v-if="resetFeedbackMessage" class="text-caption mb-2" :class="resetFeedbackClass">
        {{ resetFeedbackMessage }}
      </div>
      <div v-if="showResetAllConfirm" class="mb-3">
        <div class="text-caption text-warning mb-2" :lang="currentLocale">
          {{ $t('settings.reset.confirmWarning') }}
        </div>
        <div class="text-caption mb-2" :lang="currentLocale">
          {{ $t('settings.reset.holdHint') }}
        </div>
      </div>
      <div class="d-flex justify-end ga-2">
        <v-btn
          v-if="showResetAllConfirm"
          variant="text"
          :disabled="isResetting"
          :lang="currentLocale"
          @click="cancelResetAllConfirm"
        >
          {{ $t('settings.reset.cancel') }}
        </v-btn>
        <v-btn
          color="error"
          :variant="showResetAllConfirm ? 'flat' : 'outlined'"
          class="hold-confirm-btn"
          :style="confirmHoldStyle"
          :loading="isResetting"
          :disabled="isResetting"
          :lang="currentLocale"
          @click="requestResetAllConfirm"
          @pointerdown.prevent="startResetAllHold"
          @pointerup="cancelResetAllHold"
          @pointerleave="cancelResetAllHold"
          @pointercancel="cancelResetAllHold"
        >
          {{ showResetAllConfirm ? $t('settings.reset.confirmAction') : $t('settings.reset.all') }}
        </v-btn>
      </div>
    </AppIsland>
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
import 'flag-icons/css/flag-icons.min.css'
import { useDownloadSettings } from '../composables/useDownloadSettings'
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import AppForm from './common/AppForm.vue'
import PathField from './common/PathField.vue'
import type { DatabaseStatus } from '../../../services/database/types'

const { t, locale } = useI18n()

// General Settings
const osuStablePath = ref('')
const osuLazerPath = ref('')

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
  return `${t('download.options.threadCount')}: ${threadCount.value}`
})
const waitForDownloadsHelpText = computed(() =>
  waitForDownloadsOnPause.value
    ? t('download.options.waitForDownloadsHelpOn')
    : t('download.options.waitForDownloadsHelpOff')
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
const isSyncing = ref(false)
const syncMessage = ref('')
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
    await loadDatabaseStatus()
  } else {
    alert(t('settings.error.songsNotFound'))
  }
}

const selectOsuLazerPath = async (): Promise<void> => {
  const dir = await window.electronAPI.system.selectDirectory()
  if (!dir) return
  const validation = await window.electronAPI.settings.validatePath('lazer', dir)
  if (validation.valid) {
    osuLazerPath.value = dir
    await saveOsuLazerPath(dir)
    await loadDatabaseStatus()
  } else {
    alert(t('settings.error.realmNotFound'))
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
    } else if (progress.phase === 'progress') {
      syncMessage.value = progress.error || progress.message || ''
      void loadDatabaseStatus()
    } else if (progress.phase === 'completed' || progress.phase === 'skipped') {
      isSyncing.value = false
      void loadDatabaseStatus()
    } else if (progress.phase === 'error') {
      isSyncing.value = false
      syncMessage.value = progress.error || progress.message || ''
      void loadDatabaseStatus()
    }
  })
}

const triggerDatabaseSync = async (): Promise<void> => {
  isSyncing.value = true
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
    resetFeedbackClass.value = 'text-success'
    resetFeedbackMessage.value = t('settings.reset.success')
    showResetAllConfirm.value = false
    window.location.reload()
  } catch (error) {
    console.error('Failed to reset settings:', error)
    resetFeedbackClass.value = 'text-error'
    resetFeedbackMessage.value = t('settings.reset.failed')
  } finally {
    cancelResetAllHold()
    isResetting.value = false
  }
}

// Sync waitForDownloadsOnPause to backend whenever it changes
watch(waitForDownloadsOnPause, async (newValue) => {
  try {
    await window.electronAPI.settings.update({ waitForDownloadsOnPause: newValue })
  } catch (error) {
    console.error('Failed to save waitForDownloadsOnPause setting:', error)
  }
})

onMounted(() => {
  loadSettings()
  loadDatabaseStatus()
  loadAutoDetectWarning()
  ensureDatabaseEvents()
  document.documentElement.lang = locale.value
})

onBeforeUnmount(() => {
  if (autoDetectWarningTimer) {
    window.clearTimeout(autoDetectWarningTimer)
    autoDetectWarningTimer = null
  }
  clearResetHoldRaf()
  if (unsubscribeDatabaseSync) {
    unsubscribeDatabaseSync()
    unsubscribeDatabaseSync = null
  }
})
</script>

<style scoped>
.flag-icon {
  margin-right: 8px;
  font-size: 1.2em;
}
.v-divider {
  margin-bottom: 16px;
}

.hold-confirm-btn {
  --hold-progress: 0%;
}

.hold-confirm-btn :deep(.v-btn__overlay) {
  background: linear-gradient(
    to right,
    color-mix(in srgb, currentColor 22%, transparent) var(--hold-progress),
    transparent var(--hold-progress)
  ) !important;
  opacity: 1 !important;
}
</style>
