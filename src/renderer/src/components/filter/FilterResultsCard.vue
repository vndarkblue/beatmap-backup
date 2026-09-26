<template>
  <div class="filter-results-card">
    <!-- Header with Summary & Export Action -->
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
      <div class="d-flex align-center">
        <v-progress-circular
          v-if="isLoading"
          indeterminate
          size="20"
          width="2"
          color="primary"
          class="mr-3"
        />
        <div class="text-body-2 text-medium-emphasis">
          <span v-if="isLoading">{{ $t('filter.results.loading') }}</span>
          <span v-else>
            {{
              $t('filter.results.summary', {
                beatmaps: beatmapCount.toLocaleString(),
                sets: beatmapsetCount.toLocaleString(),
                ms: durationMs
              })
            }}
          </span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="d-flex align-center ga-2">
        <v-btn
          icon="$translate"
          :variant="preferUnicode ? 'tonal' : 'outlined'"
          :color="preferUnicode ? 'primary' : undefined"
          size="small"
          :title="$t('filter.results.unicodeTooltip')"
          @click="togglePreferUnicode"
        />

        <!-- Export Action Button -->
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          prepend-icon="$export"
          :loading="isExporting"
          :disabled="beatmapCount === 0 || isLoading"
          class="text-none font-weight-bold"
          @click="$emit('export')"
        >
          {{ isExporting ? $t('filter.results.exporting') : $t('filter.results.export') }}
        </v-btn>
      </div>
    </div>

    <!-- Results Table Container with Top Progress Bar -->
    <div class="results-table-container mb-4">
      <v-progress-linear
        :active="isLoading"
        indeterminate
        color="primary"
        height="2"
        class="results-progress-bar"
      />
      <v-table
        density="compact"
        hover
        fixed-header
        class="results-table"
        :class="{ 'results-table--loading': isLoading }"
      >
        <thead>
          <tr>
            <!-- Title -->
            <th
              class="text-left font-weight-bold sortable-th title-col"
              @click="emit('toggleSort', 'title')"
            >
              <div class="d-inline-flex align-center cursor-pointer text-no-wrap">
                <span>{{ $t('filter.results.columns.title') }}</span>
                <v-icon
                  v-if="sortBy === 'title'"
                  :icon="sortOrder === 'asc' ? '$chevronUp' : '$chevronDown'"
                  size="16"
                  color="primary"
                  class="ml-1"
                />
              </div>
            </th>

            <!-- Difficulty Version -->
            <th
              class="text-left font-weight-bold sortable-th version-col"
              @click="emit('toggleSort', 'version')"
            >
              <div class="d-inline-flex align-center cursor-pointer text-no-wrap">
                <span>{{ $t('filter.results.columns.version') }}</span>
                <v-icon
                  v-if="sortBy === 'version'"
                  :icon="sortOrder === 'asc' ? '$chevronUp' : '$chevronDown'"
                  size="16"
                  color="primary"
                  class="ml-1"
                />
              </div>
            </th>

            <!-- Stars -->
            <th
              class="text-center font-weight-bold sortable-th stars-col"
              @click="emit('toggleSort', 'stars')"
            >
              <div class="d-inline-flex align-center justify-center cursor-pointer text-no-wrap">
                <span>{{ $t('filter.results.columns.stars') }}</span>
                <v-icon
                  v-if="sortBy === 'stars' || sortBy === 'difficulty'"
                  :icon="sortOrder === 'asc' ? '$chevronUp' : '$chevronDown'"
                  size="16"
                  color="primary"
                  class="ml-1"
                />
              </div>
            </th>

            <!-- BPM -->
            <th
              class="text-center font-weight-bold sortable-th bpm-col"
              @click="emit('toggleSort', 'bpm')"
            >
              <div class="d-inline-flex align-center justify-center cursor-pointer text-no-wrap">
                <span>{{ $t('filter.results.columns.bpm') }}</span>
                <v-icon
                  v-if="sortBy === 'bpm'"
                  :icon="sortOrder === 'asc' ? '$chevronUp' : '$chevronDown'"
                  size="16"
                  color="primary"
                  class="ml-1"
                />
              </div>
            </th>

            <!-- Stats (CS / AR / HP / OD) -->
            <th class="text-center font-weight-bold stats-col">
              <div class="text-no-wrap">{{ $t('filter.results.columns.stats') }}</div>
            </th>

            <!-- Length -->
            <th
              class="text-right font-weight-bold sortable-th length-col"
              @click="emit('toggleSort', 'length')"
            >
              <div class="d-inline-flex align-center justify-end cursor-pointer text-no-wrap">
                <span>{{ $t('filter.results.columns.length') }}</span>
                <v-icon
                  v-if="sortBy === 'length'"
                  :icon="sortOrder === 'asc' ? '$chevronUp' : '$chevronDown'"
                  size="16"
                  color="primary"
                  class="ml-1"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.md5">
            <!-- Title & Artist & Mapper -->
            <td class="py-2 title-col">
              <div class="font-weight-medium text-truncate" :title="getTitle(row)">
                {{ getTitle(row) }}
              </div>
              <div
                class="text-caption text-medium-emphasis text-truncate"
                :title="`${getArtist(row)} · ${row.creator}`"
              >
                {{ getArtist(row) }} · <span class="text-disabled">{{ row.creator }}</span>
              </div>
            </td>

            <!-- Difficulty Version -->
            <td class="py-2 version-col">
              <div class="text-truncate text-body-2" :title="row.version">
                <span class="mode-icon mr-1 text-primary">{{ getModeIconByInt(row.modeInt) }}</span>
                <span>{{ row.version }}</span>
              </div>
            </td>

            <!-- Stars Badge -->
            <td class="text-center py-2 stars-col text-no-wrap">
              <v-chip
                size="x-small"
                variant="flat"
                class="font-weight-bold px-2 star-chip"
                :style="getStarChipStyle(row.stars)"
              >
                {{ row.stars.toFixed(2) }}★
              </v-chip>
            </td>

            <!-- BPM -->
            <td class="text-center py-2 text-caption font-weight-medium bpm-col text-no-wrap">
              {{ Math.round(row.bpm) }}
            </td>

            <!-- Stats: CS / AR / HP / OD -->
            <td
              class="text-center py-2 text-caption text-medium-emphasis stats-col text-no-wrap"
              :title="getStatsTooltip(row)"
            >
              {{ getStatsDisplay(row) }}
            </td>

            <!-- Length -->
            <td class="text-right py-2 text-caption text-medium-emphasis length-col text-no-wrap">
              {{ formatDuration(row.lengthSec) }}
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-if="!isLoading && rows.length === 0">
            <td colspan="6" class="text-center py-8 text-medium-emphasis">
              <v-icon icon="$fileSearch" size="36" class="mb-2 text-disabled" />
              <div>{{ $t('filter.results.empty') }}</div>
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <!-- Pagination & Page Size -->
    <div
      v-if="beatmapCount > 0"
      class="d-flex flex-wrap align-center justify-space-between ga-3 pt-2"
    >
      <div class="d-flex align-center ga-3">
        <span class="text-caption text-medium-emphasis text-no-wrap"
          >{{ $t('filter.results.pageSize') }}:</span
        >
        <v-select
          v-model="pageSize"
          :items="[25, 50, 100]"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 90px"
        />
      </div>

      <v-pagination
        v-if="totalPages > 1"
        v-model="page"
        :length="totalPages"
        :total-visible="7"
        density="comfortable"
        size="small"
        color="primary"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FilterRow } from './types'
import { STORAGE_KEYS } from '../../../../config/frontendConstants'

function initPreferUnicode(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PREFER_UNICODE_METADATA)
    return saved !== null ? saved === 'true' : true
  } catch {
    return true
  }
}

const preferUnicode = ref<boolean>(initPreferUnicode())

function togglePreferUnicode(): void {
  preferUnicode.value = !preferUnicode.value
  try {
    localStorage.setItem(STORAGE_KEYS.PREFER_UNICODE_METADATA, String(preferUnicode.value))
  } catch {
    // Ignore storage write errors
  }
}

function getTitle(row: FilterRow): string {
  if (preferUnicode.value && row.titleUnicode && row.titleUnicode.trim()) {
    return row.titleUnicode
  }
  return row.title || row.titleUnicode || ''
}

function getArtist(row: FilterRow): string {
  if (preferUnicode.value && row.artistUnicode && row.artistUnicode.trim()) {
    return row.artistUnicode
  }
  return row.artist || row.artistUnicode || ''
}

const props = withDefaults(
  defineProps<{
    rows: FilterRow[]
    beatmapCount: number
    beatmapsetCount: number
    durationMs: number
    isLoading: boolean
    isExporting: boolean
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }>(),
  {
    sortBy: 'stars',
    sortOrder: 'desc'
  }
)

const emit = defineEmits<{
  (e: 'export'): void
  (e: 'toggleSort', key: string): void
}>()

const page = defineModel<number>('page', { default: 1 })
const pageSize = defineModel<number>('pageSize', { default: 25 })

const totalPages = computed(() => {
  return Math.ceil(props.beatmapCount / pageSize.value) || 1
})

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

// --- osu!lazer Star Difficulty Color Spectrum & Helpers ---
interface ColorStop {
  star: number
  rgb: [number, number, number]
}

const STAR_DIFFICULTY_SPECTRUM: readonly ColorStop[] = [
  { star: 0.1, rgb: [170, 170, 170] }, // #aaaaaa
  { star: 0.1, rgb: [66, 144, 251] }, // #4290fb
  { star: 1.25, rgb: [79, 192, 255] }, // #4fc0ff
  { star: 2.0, rgb: [79, 255, 213] }, // #4fffd5
  { star: 2.5, rgb: [124, 255, 79] }, // #7cff4f
  { star: 3.3, rgb: [246, 240, 92] }, // #f6f05c
  { star: 4.2, rgb: [255, 128, 104] }, // #ff8068
  { star: 4.9, rgb: [255, 78, 111] }, // #ff4e6f
  { star: 5.8, rgb: [198, 69, 184] }, // #c645b8
  { star: 6.7, rgb: [101, 99, 222] }, // #6563de
  { star: 7.7, rgb: [24, 21, 142] }, // #18158e
  { star: 9.0, rgb: [0, 0, 0] }, // #000000
  { star: 10.0, rgb: [0, 0, 0] } // #000000
]

const STAR_DIFFICULTY_TEXT_SPECTRUM: readonly ColorStop[] = [
  { star: 9.0, rgb: [246, 240, 92] }, // #f6f05c
  { star: 9.9, rgb: [255, 128, 104] }, // #ff8068
  { star: 10.6, rgb: [255, 78, 111] }, // #ff4e6f
  { star: 11.5, rgb: [198, 69, 184] }, // #c645b8
  { star: 12.4, rgb: [101, 99, 222] } // #6563de
]

const colorCache = new Map<number, { bg: string; text: string }>()

function sampleFromLinearGradient(
  gradient: readonly ColorStop[],
  point: number
): [number, number, number] {
  if (point < gradient[0].star) return gradient[0].rgb

  for (let i = 0; i < gradient.length - 1; i++) {
    const startStop = gradient[i]
    const endStop = gradient[i + 1]

    if (point >= endStop.star) continue

    const t = (point - startStop.star) / (endStop.star - startStop.star)
    return [
      Math.round(startStop.rgb[0] + t * (endStop.rgb[0] - startStop.rgb[0])),
      Math.round(startStop.rgb[1] + t * (endStop.rgb[1] - startStop.rgb[1])),
      Math.round(startStop.rgb[2] + t * (endStop.rgb[2] - startStop.rgb[2]))
    ]
  }

  return gradient[gradient.length - 1].rgb
}

function getStarDifficultyColor(stars: number): { bg: string; text: string } {
  const safeStars = typeof stars === 'number' && !isNaN(stars) && stars >= 0 ? stars : 0
  const rounded = Math.round(safeStars * 100) / 100
  const cached = colorCache.get(rounded)
  if (cached) return cached

  const bgRgb = sampleFromLinearGradient(STAR_DIFFICULTY_SPECTRUM, rounded)
  const bg = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`

  let text: string
  if (rounded < 6.5) {
    text = 'rgba(0, 0, 0, 0.75)'
  } else if (rounded < 9.0) {
    text = '#ffd966'
  } else {
    const textRgb = sampleFromLinearGradient(STAR_DIFFICULTY_TEXT_SPECTRUM, rounded)
    text = `rgb(${textRgb[0]}, ${textRgb[1]}, ${textRgb[2]})`
  }

  const result = { bg, text }
  colorCache.set(rounded, result)
  return result
}

function getStarChipStyle(stars: number): Record<string, string | undefined> {
  const { bg, text } = getStarDifficultyColor(stars)
  return {
    backgroundColor: bg,
    color: `${text} !important`,
    boxShadow: stars >= 9.0 ? '0 0 0 1px rgba(255, 255, 255, 0.25)' : undefined
  }
}

const MODE_INT_ICONS: Record<number, string> = {
  0: '\uE800',
  1: '\uE803',
  2: '\uE801',
  3: '\uE802'
}

function getModeIconByInt(modeInt: number): string {
  return MODE_INT_ICONS[modeInt] ?? ''
}

function formatStat(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—'
  const rounded = Math.round(val * 10) / 10
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)
}

function getStatsDisplay(row: FilterRow): string {
  const hp = formatStat(row.hp)
  const od = formatStat(row.od)
  if (row.modeInt === 3) {
    const keys = Math.round(row.cs)
    return `${keys}K / — / ${hp} / ${od}`
  }
  if (row.modeInt === 1) {
    return `— / — / ${hp} / ${od}`
  }
  const cs = formatStat(row.cs)
  const ar = formatStat(row.ar)
  return `${cs} / ${ar} / ${hp} / ${od}`
}

function getStatsTooltip(row: FilterRow): string {
  const hp = formatStat(row.hp)
  const od = formatStat(row.od)
  if (row.modeInt === 3) {
    const keys = Math.round(row.cs)
    return `Keys: ${keys}K | HP: ${hp} | OD: ${od}`
  }
  if (row.modeInt === 1) {
    return `HP: ${hp} | OD: ${od}`
  }
  const cs = formatStat(row.cs)
  const ar = formatStat(row.ar)
  return `CS: ${cs} | AR: ${ar} | HP: ${hp} | OD: ${od}`
}
</script>

<style scoped>
.results-table-container {
  position: relative;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  overflow: hidden;
}

.results-progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

.results-table {
  border: none;
  border-radius: 0;
  font-family: var(--font-results-table) !important;
}

.results-table :deep(th),
.results-table :deep(td),
.results-table :deep([class*='text-']),
.results-table :deep(.v-chip),
.results-table :deep(span),
.results-table :deep(div) {
  font-family: var(--font-results-table) !important;
}

.results-table :deep(tbody) {
  transition:
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    filter 0.3s ease;
}

.results-table--loading :deep(tbody) {
  opacity: 0.38;
  filter: blur(0.5px);
  pointer-events: none;
}

.results-table :deep(.v-table__wrapper) {
  overflow-x: auto;
  overflow-y: auto;
  max-height: min(580px, calc(100vh - 280px));
}

.results-table :deep(.v-table__wrapper)::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.results-table :deep(.v-table__wrapper)::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-color, rgba(127, 127, 127, 0.35));
  border-radius: 4px;
}

.results-table :deep(.v-table__wrapper)::-webkit-scrollbar-track {
  background: transparent;
}

.results-table :deep(table) {
  width: 100%;
  table-layout: fixed;
  min-width: 660px;
}

.results-table :deep(th),
.results-table :deep(td) {
  padding: 0 8px !important;
}

.results-table :deep(th:first-child),
.results-table :deep(td:first-child) {
  padding-left: 14px !important;
}

.results-table :deep(th:last-child),
.results-table :deep(td:last-child) {
  padding-right: 14px !important;
}

.results-table :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 5;
  background-color: rgb(var(--v-theme-surface)) !important;
  background-color: color-mix(
    in srgb,
    var(--main-text-color) 7%,
    rgb(var(--v-theme-surface))
  ) !important;
  box-shadow: inset 0 -1px 0 rgba(var(--v-border-color), var(--v-border-opacity));
}

.title-col {
  min-width: 150px;
}

.version-col {
  width: 135px;
  min-width: 110px;
}

.stars-col {
  width: 72px;
  min-width: 72px;
}

.bpm-col {
  width: 60px;
  min-width: 60px;
}

.stats-col {
  width: 145px;
  min-width: 135px;
}

.length-col {
  width: 88px;
  min-width: 88px;
}

.bpm-col,
.stats-col,
.length-col {
  font-variant-numeric: tabular-nums;
}

.sortable-th {
  cursor: pointer;
  user-select: none;
  transition: color 0.15s ease;
}

.sortable-th:hover {
  color: rgb(var(--v-theme-primary));
}

.star-chip {
  font-weight: 700 !important;
  letter-spacing: 0.02em;
  user-select: none;
  font-variant-numeric: tabular-nums;
}

.mode-icon,
.results-table :deep(.mode-icon) {
  font-family: 'osu-extra' !important;
  font-style: normal;
  display: inline-block;
  vertical-align: middle;
}
</style>
