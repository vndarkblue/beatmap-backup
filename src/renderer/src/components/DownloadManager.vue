<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ $t('downloadManager.title') }}</h1>
    <v-card class="view-card">
      <v-card-text>
        <!-- Empty State -->
        <div v-if="!isDownloading" class="text-center py-8">
          <v-icon size="64" color="grey" class="mb-4">mdi-download-off</v-icon>
          <div class="text-h6 mb-2">{{ $t('downloadManager.emptyState.title') }}</div>
          <div class="text-body-1 mb-4">{{ $t('downloadManager.emptyState.description') }}</div>
          <v-btn color="primary" :to="{ name: 'download' }" :lang="currentLocale">
            {{ $t('downloadManager.emptyState.action') }}
          </v-btn>
        </div>

        <!-- Download Queue State -->
        <div v-else>
          <!-- Queue Overview -->
          <div class="d-flex align-center justify-space-between mb-4">
            <div class="text-h6">{{ $t('downloadManager.queueOverview') }}</div>
            <div class="d-flex">
              <v-btn
                :icon="isPaused ? 'mdi-play' : 'mdi-pause'"
                variant="text"
                :title="isPaused ? $t('downloadManager.resume') : $t('downloadManager.pause')"
                :lang="currentLocale"
                @click="togglePause"
              ></v-btn>
              <v-btn
                icon="mdi-stop"
                variant="text"
                :title="$t('downloadManager.stop')"
                :lang="currentLocale"
                @click="stopDownload"
              ></v-btn>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="mb-4">
            <div class="d-flex justify-space-between mb-2">
              <div>{{ $t('downloadManager.progress') }}</div>
              <div>{{ completedFiles }}/{{ totalFiles }} {{ $t('downloadManager.files') }}</div>
            </div>
            <v-progress-linear
              :model-value="queueProgress"
              color="primary"
              height="8"
              rounded
            ></v-progress-linear>
          </div>

          <!-- Files Table -->
          <v-table>
            <thead>
              <tr>
                <th>{{ $t('downloadManager.table.status') }}</th>
                <th>{{ $t('downloadManager.table.filename') }}</th>
                <th>{{ $t('downloadManager.table.speed') }}</th>
                <th>{{ $t('downloadManager.table.progress') }}</th>
                <th>{{ $t('downloadManager.table.remaining') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in downloadFiles" :key="file.id">
                <td>
                  <v-tooltip :text="getStatusText(file.status)" location="top">
                    <template #activator="{ props }">
                      <v-icon
                        v-bind="props"
                        :color="getStatusColor(file.status)"
                        :icon="getStatusIcon(file.status)"
                      ></v-icon>
                    </template>
                  </v-tooltip>
                </td>
                <td>{{ file.name }}</td>
                <td>{{ formatSpeed(file.speed) }}</td>
                <td>
                  <v-progress-linear
                    :model-value="file.progress"
                    color="primary"
                    height="4"
                    rounded
                  ></v-progress-linear>
                </td>
                <td>{{ formatTime(file.remainingTime) }}</td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-card-text>
    </v-card>

    <!-- Preview Toggle Button -->
    <v-btn
      class="preview-toggle"
      color="primary"
      :lang="currentLocale"
      @click="toggleDownloadState"
    >
      {{ isDownloading ? $t('downloadManager.preview.hide') : $t('downloadManager.preview.show') }}
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value)

// Mock data for preview
const isDownloading = ref(false)
const isPaused = ref(false)
const completedFiles = ref(0)
const totalFiles = ref(0)
const queueProgress = ref(0)

// Mock download files data
const downloadFiles = ref([
  {
    id: 1,
    name: 'example1.osz',
    status: 'downloading',
    speed: 1024 * 1024, // 1 MB/s
    progress: 45,
    remainingTime: 120 // seconds
  },
  {
    id: 2,
    name: 'example2.osz',
    status: 'waiting',
    speed: 0,
    progress: 0,
    remainingTime: 0
  },
  {
    id: 3,
    name: 'example3.osz',
    status: 'completed',
    speed: 0,
    progress: 100,
    remainingTime: 0
  },
  {
    id: 4,
    name: 'example4.osz',
    status: 'error',
    speed: 0,
    progress: 30,
    remainingTime: 0
  }
])

// Status helpers
const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'waiting':
      return 'mdi-clock-outline'
    case 'downloading':
      return 'mdi-download'
    case 'completed':
      return 'mdi-check-circle'
    case 'error':
      return 'mdi-alert-circle'
    default:
      return 'mdi-help-circle'
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
      return t('downloadManager.status.waiting')
    case 'downloading':
      return t('downloadManager.status.downloading')
    case 'completed':
      return t('downloadManager.status.completed')
    case 'error':
      return t('downloadManager.status.error')
    default:
      return t('downloadManager.status.unknown')
  }
}

// Format helpers
const formatSpeed = (speed: number): string => {
  if (speed === 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(speed) / Math.log(1024))
  return `${(speed / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const formatTime = (seconds: number): string => {
  if (seconds === 0) return '--:--'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// Action handlers
const togglePause = (): void => {
  isPaused.value = !isPaused.value
  // TODO: Implement pause/resume logic
}

const stopDownload = (): void => {
  // TODO: Implement stop logic
  isDownloading.value = false
}

// Toggle button for preview
const toggleDownloadState = (): void => {
  isDownloading.value = !isDownloading.value
  if (isDownloading.value) {
    completedFiles.value = 1
    totalFiles.value = 4
    queueProgress.value = 25
  } else {
    completedFiles.value = 0
    totalFiles.value = 0
    queueProgress.value = 0
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap');

.view-container {
  position: relative;
  min-height: 100%;
  width: 100%;
}

/* Add a preview toggle button */
.preview-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
}
</style>
