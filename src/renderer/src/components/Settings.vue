<template>
  <AppViewShell :title="$t('settings.title')" :lang="currentLocale">
    <!-- General Settings Section -->
    <AppIsland :title="$t('settings.general')" card-class="mb-4">
      <AppForm>
        <PathField
          v-model="osuStablePath"
          mode="directory"
          :label="$t('settings.osuStablePath')"
          :browse-title="$t('settings.selectFolder')"
          @browse="selectOsuStablePath"
        />

        <PathField
          v-model="osuLazerPath"
          mode="directory"
          :label="$t('settings.osuLazerPath')"
          :browse-title="$t('settings.selectFolder')"
          @browse="selectOsuLazerPath"
        />
      </AppForm>
      <v-divider></v-divider>
      <!-- Language Selection -->
      <v-select
        v-model="currentLocale"
        :items="availableLocales"
        :label="$t('language.title')"
        prepend-icon="mdi-translate"
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
    <AppIsland :title="$t('settings.download')" card-class="mb-4">
      <!-- Thread Count -->
      <div class="d-flex flex-column flex-sm-row align-sm-center mb-4">
        <div class="text-subtitle-1 mb-2 mb-sm-0 mr-sm-4 pb-6" :lang="currentLocale">
          {{ threadCountLabel }}
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
        </div>
      </div>
    </AppIsland>

    <AppIsland :title="$t('settings.database.title')">
      <div class="text-subtitle-1 mb-3" :lang="currentLocale">
        {{ $t('settings.database.totalBeatmapsets', { count: databaseStatus?.totals.beatmapsets ?? 0 }) }}
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

      <div v-if="syncMessage" class="text-caption mb-3" :lang="currentLocale">{{ syncMessage }}</div>

      <v-btn color="primary" :loading="isSyncing" :lang="currentLocale" @click="triggerDatabaseSync">
        {{ $t('settings.database.syncNow') }}
      </v-btn>
    </AppIsland>
  </AppViewShell>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_ENDPOINTS } from '../../../config/constants'
import { languageNames, languageFlags } from '../i18n/languageProperties'
import 'flag-icons/css/flag-icons.min.css'
import { useDownloadSettings } from '../composables/useDownloadSettings'
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import AppForm from './common/AppForm.vue'
import PathField from './common/PathField.vue'

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
    localStorage.setItem('locale', value)
    document.documentElement.lang = value
  }
})

const threadCountLabel = computed(() => {
  return `${t('download.options.threadCount')}: ${threadCount.value}`
})

const isStablePathValid = computed(() => !!osuStablePath.value)
const isLazerPathValid = computed(() => !!osuLazerPath.value)

type DatabaseStatus = {
  totals: {
    beatmapsets: number
    beatmaps: number
  }
  stable: {
    isDirty: boolean
    lastSyncAt: number | null
  }
  lazer: {
    isDirty: boolean
    lastSyncAt: number | null
  }
}

const databaseStatus = ref<DatabaseStatus | null>(null)
const isSyncing = ref(false)
const syncMessage = ref('')
let databaseEventSource: EventSource | null = null

const loadSettings = async (): Promise<void> => {
  try {
    const res = await fetch(API_ENDPOINTS.SETTINGS)
    const data = await res.json()
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
    const res = await fetch(API_ENDPOINTS.DATABASE_STATUS)
    databaseStatus.value = await res.json()
  } catch (error) {
    console.error('Failed to load database status:', error)
  }
}

const saveOsuStablePath = async (path: string): Promise<void> => {
  await fetch(API_ENDPOINTS.SETTINGS_OSU_STABLE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
}

const saveOsuLazerPath = async (path: string): Promise<void> => {
  await fetch(API_ENDPOINTS.SETTINGS_OSU_LAZER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
}

const selectOsuStablePath = async (): Promise<void> => {
  const dir = await window.electronAPI.selectDirectory()
  if (!dir) return
  const hasSongs = await window.electronAPI.checkSubDir(dir, 'Songs')
  if (hasSongs) {
    osuStablePath.value = dir
    await saveOsuStablePath(dir)
    await loadDatabaseStatus()
  } else {
    alert(t('settings.error.songsNotFound'))
  }
}

const selectOsuLazerPath = async (): Promise<void> => {
  const dir = await window.electronAPI.selectDirectory()
  if (!dir) return
  const hasRealm = await window.electronAPI.checkFile(dir, 'client.realm')
  if (hasRealm) {
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
  if (databaseEventSource) return
  databaseEventSource = new EventSource(API_ENDPOINTS.DATABASE_SYNC_EVENTS)

  const updateByEvent = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as { message?: string; error?: string }
      syncMessage.value = payload.error || payload.message || ''
      void loadDatabaseStatus()
    } catch {
      // no-op
    }
  }

  databaseEventSource.addEventListener('started', () => {
    isSyncing.value = true
  })
  databaseEventSource.addEventListener('progress', updateByEvent)
  databaseEventSource.addEventListener('completed', () => {
    isSyncing.value = false
    void loadDatabaseStatus()
  })
  databaseEventSource.addEventListener('skipped', () => {
    isSyncing.value = false
    void loadDatabaseStatus()
  })
  databaseEventSource.addEventListener('error', (event) => {
    isSyncing.value = false
    updateByEvent(event as MessageEvent<string>)
  })
}

const triggerDatabaseSync = async (): Promise<void> => {
  isSyncing.value = true
  syncMessage.value = t('settings.database.syncing')
  await fetch(API_ENDPOINTS.DATABASE_SYNC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'all', force: true })
  })
}

// Sync waitForDownloadsOnPause to backend whenever it changes
watch(waitForDownloadsOnPause, async (newValue) => {
  try {
    await fetch(API_ENDPOINTS.SETTINGS_WAIT_FOR_DOWNLOADS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waitForDownloadsOnPause: newValue })
    })
  } catch (error) {
    console.error('Failed to save waitForDownloadsOnPause setting:', error)
  }
})

onMounted(() => {
  loadSettings()
  loadDatabaseStatus()
  ensureDatabaseEvents()
  document.documentElement.lang = locale.value
})

onBeforeUnmount(() => {
  if (databaseEventSource) {
    databaseEventSource.close()
    databaseEventSource = null
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
</style>
