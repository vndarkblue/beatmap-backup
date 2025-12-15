<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ $t('settings.title') }}</h1>

    <!-- General Settings Section -->
    <v-card class="view-card mb-4">
      <v-card-title class="text-h6">General</v-card-title>
      <v-card-text>
        <v-form class="view-form">
          <v-text-field
            v-model="osuStablePath"
            :label="$t('settings.osuStablePath')"
            prepend-icon="mdi-folder"
            readonly
            class="view-field"
          >
            <template #append>
              <v-btn
                icon="mdi-folder-open"
                variant="text"
                :title="$t('settings.selectFolder')"
                @click="selectOsuStablePath"
              ></v-btn>
            </template>
          </v-text-field>

          <v-text-field
            v-model="osuLazerPath"
            :label="$t('settings.osuLazerPath')"
            prepend-icon="mdi-folder"
            readonly
            class="view-field"
          >
            <template #append>
              <v-btn
                icon="mdi-folder-open"
                variant="text"
                :title="$t('settings.selectFolder')"
                @click="selectOsuLazerPath"
              ></v-btn>
            </template>
          </v-text-field>
        </v-form>
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
      </v-card-text>
    </v-card>

    <!-- Download Settings Section -->
    <v-card class="view-card">
      <v-card-title class="text-h6">Download</v-card-title>
      <v-card-text>
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
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_ENDPOINTS } from '../../../config/constants'
import { languageNames, languageFlags } from '../i18n/languageProperties'
import { DefaultBeatmapMirrors } from '../../../config/beatmapMirrors'
import 'flag-icons/css/flag-icons.min.css'

const { t, locale } = useI18n()

// General Settings
const osuStablePath = ref('')
const osuLazerPath = ref('')

// Download Settings
const threadCount = ref(5)
const selectedSources = ref<string[]>(DefaultBeatmapMirrors.map((source) => source.name))
const removeFromStable = ref(false)
const removeFromLazer = ref(false)
const noVideo = ref(false)
const waitForDownloadsOnPause = ref(true)

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

// Save download settings to localStorage
const saveDownloadSettings = (): void => {
  const settings = {
    threadCount: threadCount.value,
    selectedSources: selectedSources.value,
    removeFromStable: removeFromStable.value,
    removeFromLazer: removeFromLazer.value,
    noVideo: noVideo.value,
    waitForDownloadsOnPause: waitForDownloadsOnPause.value
  }
  localStorage.setItem('downloadSettings', JSON.stringify(settings))
}

// Load download settings from localStorage
const loadDownloadSettings = (): void => {
  const savedSettings = localStorage.getItem('downloadSettings')
  if (savedSettings) {
    const settings = JSON.parse(savedSettings)
    threadCount.value = settings.threadCount ?? 5
    selectedSources.value = settings.selectedSources?.length
      ? settings.selectedSources
      : DefaultBeatmapMirrors.map((source) => source.name)
    removeFromStable.value = settings.removeFromStable || false
    removeFromLazer.value = settings.removeFromLazer || false
    noVideo.value = settings.noVideo || false
    waitForDownloadsOnPause.value = settings.waitForDownloadsOnPause ?? true
  }
}

const loadSettings = async (): Promise<void> => {
  try {
    const res = await fetch(API_ENDPOINTS.SETTINGS)
    const data = await res.json()
    osuStablePath.value = data.osuStablePath || ''
    osuLazerPath.value = data.osuLazerPath || ''

    // Load download options from localStorage
    loadDownloadSettings()
  } catch (error) {
    console.error('Failed to load settings:', error)
    // If backend load fails, use default mirrors and localStorage settings
    loadDownloadSettings()
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
  } else {
    alert(t('settings.error.realmNotFound'))
  }
}

// Watch for download settings changes and save to localStorage
watch([threadCount, selectedSources, removeFromStable, removeFromLazer, noVideo, waitForDownloadsOnPause], () => {
  saveDownloadSettings()
})

// Watch waitForDownloadsOnPause and sync to backend
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
  document.documentElement.lang = locale.value // Set initial lang attribute
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap');
.flag-icon {
  margin-right: 8px;
  font-size: 1.2em;
}
.v-divider {
  margin-bottom: 16px;
}
.text-h6 {
  font-family: var(--font-default) !important;
}
</style>
