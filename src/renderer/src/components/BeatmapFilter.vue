<template>
  <AppViewShell :title="$t('filter.title')" :lang="currentLocale">
    <AppForm>
      <!-- 1. Filter Criteria Island -->
      <AppIsland
        :title="$t('filter.criteriaTitle')"
        icon="$filterVariant"
        card-class="mb-0"
        content-class="px-4 px-sm-6 pb-3"
      >
        <FilterCriteriaCard
          v-model:selected-modes="selectedModes"
          v-model:selected-status="selectedStatus"
          v-model:general-search="generalSearch"
          v-model:length-range="lengthRange"
          v-model:mode-stats="modeStats"
        />
      </AppIsland>

      <v-divider class="filter-divider"></v-divider>

      <!-- 2. Results Preview Island -->
      <AppIsland
        :title="$t('filter.results.title')"
        icon="$fileSearch"
        content-class="px-4 px-sm-6 pb-5"
      >
        <FilterResultsCard
          v-model:page="page"
          v-model:page-size="pageSize"
          :rows="rows"
          :beatmap-count="beatmapCount"
          :beatmapset-count="beatmapsetCount"
          :duration-ms="durationMs"
          :is-loading="isLoading"
          :is-exporting="isExporting"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          @export="handleExport"
          @toggle-sort="handleToggleSort"
        />
      </AppIsland>
    </AppForm>

    <!-- Notification Snackbar -->
    <v-snackbar
      v-model="showSnackbar"
      :color="snackbarColor"
      timeout="4000"
      location="bottom right"
    >
      {{ snackbarText }}
      <template #actions>
        <v-btn variant="text" size="small" @click="showSnackbar = false">
          {{ $t('notifications.actions.dismiss') }}
        </v-btn>
      </template>
    </v-snackbar>
  </AppViewShell>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppViewShell from './common/AppViewShell.vue'
import AppIsland from './common/AppIsland.vue'
import AppForm from './common/AppForm.vue'
import FilterCriteriaCard from './filter/FilterCriteriaCard.vue'
import FilterResultsCard from './filter/FilterResultsCard.vue'
import { type StatRanges, defaultModeStats, type FilterRow } from './filter/types'

const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value)

// Filter Parameters State
const selectedModes = ref<string[]>(['osu'])
const selectedStatus = ref<string>('any')
const generalSearch = ref<string>('')
const lengthRange = ref<[number, number]>([0, 1800])
const modeStats = ref<Record<string, StatRanges>>(defaultModeStats())
const sortBy = ref<string>('title')
const sortOrder = ref<'asc' | 'desc'>('asc')
const isExplicitlySorted = ref(false)

const page = ref(1)
const pageSize = ref(25)

// Results State
const rows = ref<FilterRow[]>([])
const beatmapCount = ref(0)
const beatmapsetCount = ref(0)
const durationMs = ref(0)
const isLoading = ref(false)
const isExporting = ref(false)

// Snackbar State
const showSnackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let isResettingPage = false
let activeQueryId = 0

function buildFilterPayload(): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify({
      modes: selectedModes.value,
      status: selectedStatus.value,
      modeStats: modeStats.value,
      lengthRange: lengthRange.value,
      generalSearch: generalSearch.value || '',
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      page: page.value,
      pageSize: pageSize.value
    })
  )
}

async function executeFilter(minLoadingMs = 0): Promise<void> {
  const currentQueryId = ++activeQueryId
  isLoading.value = true
  const startTime = performance.now()
  try {
    const payload = buildFilterPayload()
    const result = (await window.electronAPI.database.filterBeatmaps(payload)) as {
      beatmapCount: number
      beatmapsetCount: number
      durationMs: number
      page: number
      pageSize: number
      rows: FilterRow[]
    }
    // If a newer query was fired while this was running, ignore stale response
    if (currentQueryId !== activeQueryId) return

    // Ensure smooth visual transition duration if requested
    if (minLoadingMs > 0) {
      const elapsed = performance.now() - startTime
      if (elapsed < minLoadingMs) {
        await new Promise((resolve) => setTimeout(resolve, minLoadingMs - elapsed))
      }
      if (currentQueryId !== activeQueryId) return
    }

    rows.value = result.rows || []
    beatmapCount.value = result.beatmapCount || 0
    beatmapsetCount.value = result.beatmapsetCount || 0
    durationMs.value = result.durationMs || 0
  } catch (err) {
    if (currentQueryId === activeQueryId) {
      console.error('Failed to execute beatmap filter:', err)
    }
  } finally {
    if (currentQueryId === activeQueryId) {
      isLoading.value = false
    }
  }
}

function triggerFilterWithDebounce(resetPage = true, delay = 300, minLoadingMs = 400): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  debounceTimer = setTimeout(() => {
    if (resetPage && page.value !== 1) {
      isResettingPage = true
      page.value = 1
    }
    executeFilter(minLoadingMs)
  }, delay)
}

function handleToggleSort(columnKey: string): void {
  const isTextCol = ['title', 'version'].includes(columnKey)
  const firstOrder: 'asc' | 'desc' = isTextCol ? 'asc' : 'desc'
  const secondOrder: 'asc' | 'desc' = isTextCol ? 'desc' : 'asc'

  if (sortBy.value === columnKey) {
    if (sortOrder.value === firstOrder) {
      // 2nd click: flip order
      sortOrder.value = secondOrder
      isExplicitlySorted.value = true
    } else {
      // 3rd click: deactivate (reset)
      isExplicitlySorted.value = false
      if ((generalSearch.value || '').trim() !== '') {
        sortBy.value = 'relevance'
      } else {
        sortBy.value = 'title'
        sortOrder.value = 'asc'
      }
    }
  } else {
    // 1st click on column
    isExplicitlySorted.value = true
    sortBy.value = columnKey
    sortOrder.value = firstOrder
  }
}

// Auto-switch to relevance when search keyword is introduced; restore default when cleared
watch(generalSearch, (newVal, oldVal) => {
  const trimmedNew = (newVal || '').trim()
  const trimmedOld = (oldVal || '').trim()

  if (trimmedNew !== '' && trimmedOld === '') {
    isExplicitlySorted.value = false
    sortBy.value = 'relevance'
  } else if (trimmedNew !== '' && !isExplicitlySorted.value) {
    sortBy.value = 'relevance'
  } else if (trimmedNew === '') {
    isExplicitlySorted.value = false
    if (sortBy.value === 'relevance') {
      sortBy.value = 'title'
      sortOrder.value = 'asc'
    }
  }
})

// Watch filters to trigger debounced query with smooth 400ms transition
watch(
  [selectedModes, selectedStatus, generalSearch, lengthRange, modeStats, sortBy, sortOrder],
  () => triggerFilterWithDebounce(true, 300, 400),
  { deep: true }
)

// Watch pagination changes (smooth 200ms transition, ignores resets triggered by filter criteria)
watch([page, pageSize], () => {
  if (isResettingPage) {
    isResettingPage = false
    return
  }
  executeFilter(200)
})

async function handleExport(): Promise<void> {
  if (beatmapCount.value === 0 || isExporting.value) return
  isExporting.value = true
  try {
    const payload = buildFilterPayload()
    const result = await window.electronAPI.database.exportFilteredBackup(payload)
    if (result.success) {
      snackbarColor.value = 'success'
      snackbarText.value = t('filter.results.exportSuccess', { count: result.count })
      showSnackbar.value = true
    } else if (result.error && result.error !== 'cancelled') {
      snackbarColor.value = 'error'
      snackbarText.value = t('filter.results.exportError')
      showSnackbar.value = true
    }
  } catch (err) {
    console.error('Failed to export filtered beatmaps:', err)
    snackbarColor.value = 'error'
    snackbarText.value = t('filter.results.exportError')
    showSnackbar.value = true
  } finally {
    isExporting.value = false
  }
}

onMounted(() => {
  executeFilter()
})
</script>

<style scoped>
.filter-divider {
  width: 90%;
  max-width: 920px;
  margin: -10px auto !important;
  opacity: 0.5;
  border-color: var(--card-border-color) !important;
}
</style>
