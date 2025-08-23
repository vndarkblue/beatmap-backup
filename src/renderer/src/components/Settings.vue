<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ $t('settings.title') }}</h1>
    <v-card class="view-card">
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
        <v-switch
          v-model="rememberDownloadPath"
          :label="$t('settings.rememberDownloadPath')"
          color="primary"
          class="view-field pl-2 settings-switch"
          @update:model-value="saveRememberDownloadPath"
        ></v-switch>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_ENDPOINTS } from '../../../config/constants'
import { languageNames, languageFlags } from '../i18n/languageProperties'
import 'flag-icons/css/flag-icons.min.css'

const { t, locale } = useI18n()
const osuStablePath = ref('')
const osuLazerPath = ref('')
const rememberDownloadPath = ref(true)

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

const loadSettings = async (): Promise<void> => {
  try {
    const res = await fetch(API_ENDPOINTS.SETTINGS)
    const data = await res.json()
    osuStablePath.value = data.osuStablePath || ''
    osuLazerPath.value = data.osuLazerPath || ''
    rememberDownloadPath.value = data.rememberDownloadPath ?? true
  } catch (error) {
    console.error('Failed to load settings:', error)
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

const saveRememberDownloadPath = (remember: boolean | null): void => {
  const value = !!remember
  void fetch(API_ENDPOINTS.SETTINGS_REMEMBER_DOWNLOAD_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remember: value })
  })
}

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
.settings-switch {
  margin-bottom: -16px !important;
  margin-top: -16px !important;
}
</style>
