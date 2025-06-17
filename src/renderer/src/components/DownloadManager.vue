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
                <td>{{ file.id }}</td>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { API_ENDPOINTS } from '../../../config/constants'
// import type DownloadEvent  from '../types/download'

const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value)

// Download state
const isDownloading = ref(false)
const isPaused = ref(false)
const completedFiles = ref(0)
const totalFiles = ref(0)
const queueProgress = ref(0)
const downloadFiles = ref<DownloadTask[]>([])

// Add this interface definition:
interface DownloadTask {
  id: string
  beatmapsetId: string
  mirror: string
  noVideo: boolean
  status: 'waiting' | 'downloading' | 'completed' | 'error'
  progress: number
  speed: number
  remainingTime: number
  error?: string
  downloadPath?: string
}

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

// Update download state
const updateDownloadState = (tasks: DownloadTask[]): void => {
  downloadFiles.value = tasks
  totalFiles.value = tasks.length
  completedFiles.value = tasks.filter((task) => task.status === 'completed').length
  queueProgress.value = totalFiles.value > 0 ? (completedFiles.value / totalFiles.value) * 100 : 0
  isDownloading.value = totalFiles.value > 0
}

// Action handlers
const togglePause = async (): Promise<void> => {
  try {
    const endpoint = isPaused.value ? API_ENDPOINTS.DOWNLOAD_RESUME : API_ENDPOINTS.DOWNLOAD_PAUSE
    const response = await fetch(endpoint, { method: 'POST' })
    if (!response.ok) {
      throw new Error('Failed to toggle pause state')
    }
  } catch (error) {
    console.error('Failed to toggle pause:', error)
  }
}

const stopDownload = async (): Promise<void> => {
  try {
    const response = await fetch(API_ENDPOINTS.DOWNLOAD_STOP, { method: 'POST' })
    if (!response.ok) {
      throw new Error('Failed to stop download')
    }
  } catch (error) {
    console.error('Failed to stop download:', error)
  }
}

// SSE setup
let eventSource: EventSource | null = null

const connectSSE = (): void => {
  if (eventSource) {
    console.log('SSE connection already exists')
    return
  }

  console.log('Creating new SSE connection')
  eventSource = new EventSource(API_ENDPOINTS.DOWNLOAD_EVENTS)

  eventSource.addEventListener('initialState', (e) => {
    try {
      const data = JSON.parse(e.data)
      // Check if data is an array of tasks
      if (Array.isArray(data)) {
        updateDownloadState(data)
      } else {
        console.warn('Invalid initialState data format:', data)
        updateDownloadState([])
      }
    } catch (error) {
      console.error('Failed to parse initialState:', error)
      updateDownloadState([])
    }
  })

  eventSource.addEventListener('taskAdded', (e) => {
    try {
      const task = JSON.parse(e.data)
      downloadFiles.value = [...downloadFiles.value, task]
      updateDownloadState(downloadFiles.value)
    } catch (error) {
      console.error('Failed to parse taskAdded:', error)
    }
  })

  eventSource.addEventListener('taskUpdated', (e) => {
    try {
      const updatedTask = JSON.parse(e.data)
      const index = downloadFiles.value.findIndex((t) => t.id === updatedTask.id)
      if (index !== -1) {
        downloadFiles.value[index] = updatedTask
        updateDownloadState(downloadFiles.value)
      }
    } catch (error) {
      console.error('Failed to parse taskUpdated:', error)
    }
  })

  eventSource.addEventListener('taskCompleted', (e) => {
    try {
      const completedTask = JSON.parse(e.data)
      const index = downloadFiles.value.findIndex((t) => t.id === completedTask.id)
      if (index !== -1) {
        downloadFiles.value[index] = completedTask
        updateDownloadState(downloadFiles.value)
      }
    } catch (error) {
      console.error('Failed to parse taskCompleted:', error)
    }
  })

  eventSource.addEventListener('taskError', (e) => {
    try {
      const errorTask = JSON.parse(e.data)
      const index = downloadFiles.value.findIndex((t) => t.id === errorTask.id)
      if (index !== -1) {
        downloadFiles.value[index] = errorTask
        updateDownloadState(downloadFiles.value)
      }
    } catch (error) {
      console.error('Failed to parse taskError:', error)
    }
  })

  eventSource.addEventListener('queuePaused', () => {
    isPaused.value = true
  })

  eventSource.addEventListener('queueResumed', () => {
    isPaused.value = false
  })

  eventSource.addEventListener('queueCleared', () => {
    isDownloading.value = false
    isPaused.value = false
    completedFiles.value = 0
    totalFiles.value = 0
    queueProgress.value = 0
    downloadFiles.value = []
    // Close SSE connection when queue is cleared
    disconnectSSE()
  })

  eventSource.onerror = (error) => {
    console.error('SSE error:', error)
    // Only try to reconnect if we're still downloading
    if (isDownloading.value) {
      setTimeout(() => {
        if (eventSource) {
          eventSource.close()
          eventSource = null
          connectSSE()
        }
      }, 5000)
    } else {
      disconnectSSE()
    }
  }
}

const disconnectSSE = (): void => {
  if (eventSource) {
    console.log('Closing SSE connection')
    eventSource.close()
    eventSource = null
  }
}

// Watch for changes in isDownloading
watch(isDownloading, (newValue) => {
  if (newValue) {
    connectSSE()
  } else {
    disconnectSSE()
  }
})

onMounted(() => {
  // Check current download status immediately
  fetch(API_ENDPOINTS.DOWNLOAD_EVENTS)
    .then(response => response.json())
    .then(data => {
      if (Array.isArray(data)) {
        updateDownloadState(data)
        if (data.length > 0) {
          connectSSE()
        }
      }
    })
    .catch(error => {
      console.error('Failed to check initial download status:', error)
    })
})

onUnmounted(() => {
  disconnectSSE()
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap');

.view-container {
  position: relative;
  min-height: 100%;
  width: 100%;
}
</style>
