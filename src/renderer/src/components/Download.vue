<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ $t('download.title') }}</h1>
    <v-card class="view-card">
      <v-card-text>
        <v-form class="view-form">
          <!-- File Selection -->
          <v-text-field
            v-model="selectedFileName"
            :label="$t('download.selectFile')"
            prepend-icon="mdi-file-document"
            class="view-field"
            :rules="[(v) => !!v || $t('download.fileRequired')]"
            :lang="currentLocale"
            readonly
          >
            <template #append>
              <v-btn
                icon="mdi-file-search"
                variant="text"
                :title="$t('download.selectFile')"
                @click="handleFileSelect"
              ></v-btn>
            </template>
          </v-text-field>

          <!-- Download Options Section -->
          <v-expansion-panels class="view-field">
            <v-expansion-panel>
              <v-expansion-panel-title :lang="currentLocale">
                {{ $t('download.options.title') }}
              </v-expansion-panel-title>
              <v-expansion-panel-text>
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

                <!-- Two column layout for mirrors and duplicates -->
                <div class="d-flex flex-column flex-sm-row">
                  <!-- Beatmap Mirrors Column -->
                  <div class="flex-grow-1 pr-sm-4 mb-4 mb-sm-0 mirrors-column">
                    <div class="d-flex align-center justify-space-between mb-2">
                      <div class="text-subtitle-1" :lang="currentLocale">
                        {{ $t('download.options.beatmapMirrors') }}
                      </div>
                      <v-tooltip
                        :text="t('download.options.refresh')"
                        location="left"
                        :disabled="isRefreshing"
                      >
                        <template #activator="{ props }">
                          <v-btn
                            v-bind="props"
                            icon="mdi-refresh"
                            variant="text"
                            size="small"
                            class="refresh-button"
                            :loading="isRefreshing"
                            :disabled="isRefreshing"
                            @click="handleRefreshStatus"
                          >
                            <template #loader>
                              <v-progress-circular
                                indeterminate
                                size="20"
                                width="2"
                                color="primary"
                              ></v-progress-circular>
                            </template>
                          </v-btn>
                        </template>
                      </v-tooltip>
                    </div>
                    <v-switch
                      v-for="source in beatmapMirrors"
                      :key="source.name"
                      v-model="selectedSources"
                      :label="source.name"
                      :value="source.name"
                      class="view-field"
                      :lang="currentLocale"
                      color="primary"
                      hide-details
                    >
                      <template #append>
                        <v-tooltip :text="getMirrorStatusTooltip(source.name)" location="right">
                          <template #activator="{ props }">
                            <v-icon
                              v-bind="props"
                              :color="getMirrorStatusColor(source.name)"
                              size="small"
                            >
                              {{ getMirrorStatusIcon(source.name) }}
                            </v-icon>
                          </template>
                        </v-tooltip>
                      </template>
                    </v-switch>
                  </div>

                  <v-divider vertical class="mx-4 d-none d-sm-flex"></v-divider>

                  <!-- Remove Duplicates & Other Options Column -->
                  <div class="flex-grow-1">
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
                    <div class="text-subtitle-1 mb-4 mt-3" :lang="currentLocale">
                      {{ $t('download.options.other') }}
                    </div>
                    <v-switch
                      v-model="noVideo"
                      :label="$t('download.options.noVideo')"
                      color="primary"
                      hide-details
                      class="view-field pl-2"
                    ></v-switch>
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <!-- Download Path -->
          <v-text-field
            v-model="downloadPath"
            :label="$t('download.path')"
            prepend-icon="mdi-folder"
            readonly
            class="view-field"
            clearable
            @click:clear="downloadPath = ''"
          >
            <template #append>
              <v-btn
                icon="mdi-folder-open"
                variant="text"
                :title="$t('download.path')"
                @click="selectDownloadPath"
              ></v-btn>
            </template>
          </v-text-field>

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

          <!-- Status Message -->
          <div
            v-if="statusMessage"
            class="text-center mt-2"
            :class="{ 'text-success': isSuccess, 'text-error': !isSuccess }"
          >
            {{ statusMessage }}
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { DefaultBeatmapMirrors } from '../../../config/beatmapMirrors'
import { API_ENDPOINTS } from '../../../config/constants'

const { locale, t } = useI18n()
const router = useRouter()
const currentLocale = computed(() => locale.value)

// Enhanced File type for Electron
interface ElectronFile extends File {
  path: string
}

interface MirrorStatus {
  name: string
  isOnline: boolean
  lastChecked: number
  error?: string
}

// Form data
const selectedFile = ref<ElectronFile | null>(null)
const selectedFileName = ref('')
const threadCount = ref(5)
const downloadPath = ref('')
const isDownloading = ref(false)
const statusMessage = ref('')
const isSuccess = ref(false)
const removeFromStable = ref(false)
const removeFromLazer = ref(false)
const noVideo = ref(false)
const mirrorStatuses = ref<MirrorStatus[]>([])

// Add osu paths state
const osuStablePath = ref('')
const osuLazerPath = ref('')

// Computed properties for checkbox states
const isStablePathValid = computed(() => !!osuStablePath.value)
const isLazerPathValid = computed(() => !!osuLazerPath.value)

// Load beatmap mirrors from backend
const beatmapMirrors = ref(DefaultBeatmapMirrors)
const selectedSources = ref<string[]>(DefaultBeatmapMirrors.map((source) => source.name))

// Add these to the script section:
const isRefreshing = ref(false)
let refreshTimeout: number | null = null

// Load mirror statuses
const loadMirrorStatuses = async (): Promise<void> => {
  try {
    const response = await fetch(API_ENDPOINTS.MIRRORS_STATUS)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Server did not return JSON')
    }
    mirrorStatuses.value = await response.json()
  } catch (error) {
    console.error('Failed to load mirror statuses:', error)
    // Set all mirrors to unknown status
    mirrorStatuses.value = beatmapMirrors.value.map((mirror) => ({
      name: mirror.name,
      isOnline: false,
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }))
  }
}

// Save to localStorage
const saveToLocalStorage = (): void => {
  const settings = {
    threadCount: threadCount.value,
    selectedSources: selectedSources.value,
    removeFromStable: removeFromStable.value,
    removeFromLazer: removeFromLazer.value,
    noVideo: noVideo.value
  }
  localStorage.setItem('downloadSettings', JSON.stringify(settings))
}

// Load from localStorage
const loadFromLocalStorage = (): void => {
  const savedSettings = localStorage.getItem('downloadSettings')
  if (savedSettings) {
    const settings = JSON.parse(savedSettings)
    threadCount.value = settings.threadCount ?? 5
    selectedSources.value = settings.selectedSources?.length
      ? settings.selectedSources
      : beatmapMirrors.value.map((source) => source.name)
    removeFromStable.value = settings.removeFromStable || false
    removeFromLazer.value = settings.removeFromLazer || false
    noVideo.value = settings.noVideo || false
  }
}

// Load settings
const loadSettings = async (): Promise<void> => {
  try {
    // Load beatmap mirrors from backend
    const res = await fetch(API_ENDPOINTS.SETTINGS)
    const data = await res.json()

    // Update beatmap mirrors if available
    if (data.beatmapMirrors && Array.isArray(data.beatmapMirrors)) {
      beatmapMirrors.value = data.beatmapMirrors
    }

    // Update osu paths
    osuStablePath.value = data.osuStablePath || ''
    osuLazerPath.value = data.osuLazerPath || ''

    // Load download options from localStorage
    loadFromLocalStorage()

    console.log('Loaded settings:', {
      threadCount: threadCount.value,
      selectedSources: selectedSources.value,
      osuStablePath: osuStablePath.value,
      osuLazerPath: osuLazerPath.value
    })
  } catch (error) {
    console.error('Failed to load settings:', error)
    // If backend load fails, use default mirrors and localStorage settings
    loadFromLocalStorage()
  }
}

// Watch for changes and save to localStorage only
watch([threadCount, selectedSources, removeFromStable, removeFromLazer, noVideo], () => {
  saveToLocalStorage()
})

// Make sure settings are loaded when component is mounted
onMounted(() => {
  loadSettings()
  loadMirrorStatuses()
  // Refresh status every 5 minutes
  const intervalId = setInterval(loadMirrorStatuses, 5 * 60 * 1000)

  // Cleanup on unmount
  onUnmounted(() => {
    clearInterval(intervalId)
    if (refreshTimeout !== null) {
      clearTimeout(refreshTimeout)
    }
  })
})

// Computed label for thread count
const threadCountLabel = computed(() => {
  return `${t('download.options.threadCount')}: ${threadCount.value}`
})

// Computed properties
const isDownloadEnabled = computed(() => {
  return selectedFile.value !== null && selectedSources.value.length > 0
})

// Handle file selection
const handleFileSelect = async (): Promise<void> => {
  try {
    const filePath = await window.electronAPI.getFilePath()
    if (filePath) {
      const fileName = filePath.split(/[\\/]/).pop() || ''
      selectedFileName.value = fileName
      selectedFile.value = {
        name: fileName,
        path: filePath
      } as ElectronFile
      console.log(`File selected: ${fileName}, path: ${filePath}`)
    }
  } catch (error) {
    console.error('Failed to get file path:', error)
    statusMessage.value = t('download.errors.getFilePath')
    isSuccess.value = false
  }
}

// Methods
const selectDownloadPath = async (): Promise<void> => {
  const dir = await window.electronAPI.selectDirectory()
  if (dir) {
    downloadPath.value = dir
  }
}

const handleDownload = async (): Promise<void> => {
  if (!isDownloadEnabled.value) return

  try {
    isDownloading.value = true
    statusMessage.value = ''

    // Get the file path from the enhanced File object
    const filePath = selectedFile.value?.path
    if (!filePath) {
      throw new Error('Could not get file path')
    }

    // Prepare download data
    const downloadData = {
      filePath,
      options: {
        threadCount: threadCount.value,
        sources: selectedSources.value,
        removeFromStable: removeFromStable.value,
        removeFromLazer: removeFromLazer.value,
        noVideo: noVideo.value
      },
      downloadPath: downloadPath.value || undefined
    }

    console.log('Download request data:', {
      filePath: downloadData.filePath,
      threadCount: downloadData.options.threadCount,
      selectedMirrors: downloadData.options.sources,
      downloadPath: downloadData.downloadPath
    })

    const response = await fetch(API_ENDPOINTS.DOWNLOAD, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(downloadData)
    })

    if (!response.ok) {
      let errorMessage = t('download.error')
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        // If JSON parsing fails, use status text
        errorMessage = response.statusText || errorMessage
      }
      throw new Error(errorMessage)
    }

    let result
    try {
      result = await response.json()
    } catch (e) {
      console.warn('Failed to parse response JSON:', e)
      result = { success: true }
    }
    console.log('Download started:', result)

    isSuccess.value = true
    statusMessage.value = t('download.started')
    // Navigate to DownloadManager after successful start
    await router.push({ name: 'download-manager' })
  } catch (error) {
    console.error('Download failed:', error)
    isSuccess.value = false
    statusMessage.value = error instanceof Error ? error.message : t('download.error')
  } finally {
    isDownloading.value = false
  }
}

const getMirrorStatus = (mirrorName: string): MirrorStatus | undefined => {
  return mirrorStatuses.value.find((status) => status.name === mirrorName)
}

const getMirrorStatusColor = (mirrorName: string): string => {
  const status = getMirrorStatus(mirrorName)
  if (!status) return 'grey'
  return status.isOnline ? 'success' : 'error'
}

const getMirrorStatusIcon = (mirrorName: string): string => {
  const status = getMirrorStatus(mirrorName)
  if (!status) return 'mdi-help-circle'
  return status.isOnline ? 'mdi-check-circle' : 'mdi-alert-circle'
}

const getMirrorStatusTooltip = (mirrorName: string): string => {
  const status = getMirrorStatus(mirrorName)
  if (!status) return t('download.options.statusUnknown')
  if (status.isOnline) return t('download.options.online')
  return `${t('download.options.offline')}: ${status.error || t('download.options.unknownError')}`
}

const handleRefreshStatus = async (): Promise<void> => {
  if (isRefreshing.value) return

  // Clear any existing timeout
  if (refreshTimeout !== null) {
    clearTimeout(refreshTimeout)
  }

  isRefreshing.value = true
  try {
    await loadMirrorStatuses()
  } finally {
    refreshTimeout = window.setTimeout(() => {
      isRefreshing.value = false
      refreshTimeout = null
    }, 1000)
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap');
.text-success {
  color: #4caf50;
}
.text-error {
  color: #f44336;
}

.view-container {
  position: relative;
  min-height: 100%;
  width: 100%;
}
.refresh-button {
  margin-right: -10px !important;
}
</style>
