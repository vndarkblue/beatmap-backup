<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ $t('settings.title') }}</h1>

    <!-- General Settings Section -->
    <v-card class="view-card mb-4">
      <v-card-title class="text-h6">{{ $t('settings.general') }}</v-card-title>
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
      <v-card-title class="text-h6">{{ $t('settings.download') }}</v-card-title>
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
import 'flag-icons/css/flag-icons.min.css'
import { useDownloadSettings } from '../composables/useDownloadSettings'

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
  document.documentElement.lang = locale.value
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
