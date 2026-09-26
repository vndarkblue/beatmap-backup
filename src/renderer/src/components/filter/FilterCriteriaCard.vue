<template>
  <div class="filter-criteria-card">
    <!-- Mode Selection -->
    <div class="mb-4">
      <div class="text-subtitle-2 mb-2 font-weight-bold">{{ $t('filter.gameMode') }}</div>
      <v-chip-group v-model="selectedModes" column multiple color="primary">
        <v-chip
          v-for="mode in GAME_MODES"
          :key="mode.value"
          :value="mode.value"
          filter
          variant="outlined"
          class="font-weight-medium"
        >
          <span class="mode-icon mr-1">{{ mode.icon }}</span>
          {{ mode.label }}
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Status Selection -->
    <div class="mb-5">
      <div class="text-subtitle-2 mb-2 font-weight-bold">{{ $t('filter.status') }}</div>
      <v-btn-toggle
        v-model="selectedStatus"
        color="primary"
        density="comfortable"
        mandatory
        class="d-flex flex-wrap status-toggle"
        variant="outlined"
      >
        <v-btn
          v-for="opt in statusOptions"
          :key="opt"
          :value="opt"
          class="flex-grow-1 text-none"
          size="small"
        >
          {{ $t(`filter.statusOptions.${opt}`) }}
        </v-btn>
      </v-btn-toggle>
    </div>

    <!-- General Search -->
    <div class="mb-5">
      <v-text-field
        v-model="generalSearch"
        :label="$t('filter.search')"
        :placeholder="$t('filter.searchPlaceholder')"
        prepend-inner-icon="$fileSearch"
        variant="outlined"
        density="comfortable"
        clearable
        hide-details
      />
    </div>

    <!-- Stats Ranges (Sliders) -->
    <v-expansion-panels v-model="panelOpen" variant="accordion" class="mb-2">
      <v-expansion-panel elevation="0" class="criteria-expansion-panel">
        <v-expansion-panel-title static class="py-2 px-3 text-subtitle-2 font-weight-bold">
          <v-icon icon="$cog" size="small" class="mr-2" />
          {{ $t('filter.difficulty') }}
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <!-- Mode Tabs (when more than 1 mode is selected) -->
          <div v-if="selectedModes.length > 1" class="mb-4">
            <v-tabs v-model="activeDifficultyMode" density="compact" color="primary" height="36">
              <v-tab
                v-for="modeKey in selectedModes"
                :key="modeKey"
                :value="modeKey"
                class="text-none font-weight-medium text-body-2"
              >
                <span class="mode-icon mr-1">{{ getModeIcon(modeKey) }}</span>
                {{ getModeLabel(modeKey) }}
              </v-tab>
            </v-tabs>
          </div>

          <v-row dense>
            <!-- Stars Slider -->
            <v-col cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{ $t('filter.stars') }}</span>
                <span class="font-weight-bold text-primary"
                  >{{ currentStats.stars[0] }}★ - {{ currentStats.stars[1] }}★</span
                >
              </div>
              <v-range-slider
                v-model="currentStats.stars"
                :min="0"
                :max="12"
                :step="0.1"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>

            <!-- BPM Slider -->
            <v-col cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{ $t('filter.bpm') }}</span>
                <span class="font-weight-bold text-primary"
                  >{{ currentStats.bpm[0] }} - {{ currentStats.bpm[1] }}</span
                >
              </div>
              <v-range-slider
                v-model="currentStats.bpm"
                :min="0"
                :max="400"
                :step="5"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>

            <!-- Length Slider -->
            <v-col cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{ $t('filter.length') }}</span>
                <span class="font-weight-bold text-primary"
                  >{{ formatDuration(lengthRange[0]) }} - {{ formatDuration(lengthRange[1]) }}</span
                >
              </div>
              <v-range-slider
                v-model="lengthRange"
                :min="0"
                :max="1800"
                :step="5"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>

            <!-- AR Slider (Only for osu, catch) -->
            <v-col v-if="showStat('ar')" cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{ $t('filter.ar') }}</span>
                <span class="font-weight-bold text-primary"
                  >{{ currentStats.ar[0] }} - {{ currentStats.ar[1] }}</span
                >
              </div>
              <v-range-slider
                v-model="currentStats.ar"
                :min="0"
                :max="10"
                :step="0.1"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>

            <!-- CS / Keys Slider (For osu, catch, mania; Mania has Keys 1-10) -->
            <v-col v-if="showStat('cs')" cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{
                  activeDifficultyMode === 'mania' ? $t('filter.keys') : $t('filter.cs')
                }}</span>
                <span class="font-weight-bold text-primary">
                  {{
                    activeDifficultyMode === 'mania'
                      ? $t('filter.keysRange', { min: currentStats.cs[0], max: currentStats.cs[1] })
                      : `${currentStats.cs[0]} - ${currentStats.cs[1]}`
                  }}
                </span>
              </div>
              <v-range-slider
                v-if="activeDifficultyMode === 'mania'"
                v-model="currentStats.cs"
                :min="1"
                :max="10"
                :step="1"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
              <v-range-slider
                v-else
                v-model="currentStats.cs"
                :min="0"
                :max="10"
                :step="0.1"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>

            <!-- OD Slider -->
            <v-col v-if="showStat('od')" cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{ $t('filter.od') }}</span>
                <span class="font-weight-bold text-primary"
                  >{{ currentStats.od[0] }} - {{ currentStats.od[1] }}</span
                >
              </div>
              <v-range-slider
                v-model="currentStats.od"
                :min="0"
                :max="10"
                :step="0.1"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>

            <!-- HP Slider -->
            <v-col v-if="showStat('hp')" cols="12" md="6">
              <div class="d-flex justify-space-between text-body-2 mb-1">
                <span class="font-weight-medium">{{ $t('filter.hp') }}</span>
                <span class="font-weight-bold text-primary"
                  >{{ currentStats.hp[0] }} - {{ currentStats.hp[1] }}</span
                >
              </div>
              <v-range-slider
                v-model="currentStats.hp"
                :min="0"
                :max="10"
                :step="0.1"
                density="compact"
                thumb-size="14"
                track-size="3"
                color="primary"
                hide-details
              />
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div class="d-flex justify-end">
      <v-btn
        variant="text"
        size="small"
        prepend-icon="$refresh"
        color="secondary"
        class="text-none"
        @click="resetFilters"
      >
        {{ $t('filter.resetAll') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { type StatRanges, defaultStats, defaultModeStats, GAME_MODES, MODE_INFO_MAP } from './types'

function getModeLabel(modeKey: string): string {
  return MODE_INFO_MAP[modeKey]?.label ?? modeKey
}

function getModeIcon(modeKey: string): string {
  return MODE_INFO_MAP[modeKey]?.icon ?? ''
}

const statusOptions = [
  'any',
  'hasLeaderboard',
  'ranked',
  'loved',
  'approved',
  'qualified',
  'unranked'
]

const panelOpen = ref<number | undefined>(0)

const selectedModes = defineModel<string[]>('selectedModes', { default: () => ['osu'] })
const selectedStatus = defineModel<string>('selectedStatus', { default: 'any' })
const generalSearch = defineModel<string>('generalSearch', { default: '' })
const lengthRange = defineModel<[number, number]>('lengthRange', { default: () => [0, 1800] })

const modeStats = defineModel<Record<string, StatRanges>>('modeStats', { required: true })

const activeDifficultyMode = ref<string>('osu')

watch(
  selectedModes,
  (modes) => {
    if (modes.length > 0 && !modes.includes(activeDifficultyMode.value)) {
      activeDifficultyMode.value = modes[0]
    }
  },
  { immediate: true }
)

const currentStats = computed<StatRanges>({
  get: () => {
    const m = activeDifficultyMode.value
    return modeStats.value[m] ?? defaultStats()
  },
  set: (val) => {
    const updated = { ...modeStats.value }
    updated[activeDifficultyMode.value] = { ...val }
    modeStats.value = updated
  }
})

function showStat(statKey: 'ar' | 'cs' | 'od' | 'hp'): boolean {
  const m = activeDifficultyMode.value
  if (statKey === 'ar') return ['osu', 'catch'].includes(m)
  if (statKey === 'cs') return ['osu', 'catch', 'mania'].includes(m)
  if (statKey === 'od') return ['osu', 'taiko', 'catch', 'mania'].includes(m)
  if (statKey === 'hp') return ['osu', 'taiko', 'catch', 'mania'].includes(m)
  return true
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

function resetFilters(): void {
  selectedModes.value = ['osu']
  selectedStatus.value = 'any'
  generalSearch.value = ''
  lengthRange.value = [0, 1800]
  activeDifficultyMode.value = 'osu'
  modeStats.value = defaultModeStats()
}
</script>

<style scoped>
.status-toggle {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  background: rgba(var(--v-theme-surface-variant), 0.12);
}

.status-toggle :deep(.v-btn) {
  border-radius: 0;
  border: none !important;
  border-right: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7)) !important;
  border-bottom: 1px solid rgba(var(--v-border-color), calc(var(--v-border-opacity) * 0.7)) !important;
  position: relative;
  overflow: hidden;
  transition:
    color 0.25s ease,
    background 0.25s ease,
    text-shadow 0.25s ease;
}

/* Ẩn khối phủ chữ nhật vuông mặc định của Vuetify */
.status-toggle :deep(.v-btn--active > .v-btn__overlay),
.status-toggle :deep(.v-btn--active > .v-btn__underlay) {
  opacity: 0 !important;
}

/* Nền glow elip tỏa ra từ chân nút lên phía sau chữ */
.status-toggle :deep(.v-btn--active) {
  background: radial-gradient(
    ellipse 75% 70% at 50% 100%,
    rgba(var(--v-theme-primary), 0.32) 0%,
    rgba(var(--v-theme-primary), 0.12) 45%,
    transparent 80%
  ) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 700 !important;
}

/* Hiệu ứng neon text-shadow nhẹ trên chữ đang chọn */
.status-toggle :deep(.v-btn--active .v-btn__content) {
  text-shadow: 0 0 10px rgba(var(--v-theme-primary), 0.45);
}

/* Vạch sáng neon mảnh bo tròn dưới chân nút làm điểm neo cho vùng glow elip */
.status-toggle :deep(.v-btn--active)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 18%;
  right: 18%;
  height: 2.5px;
  background: rgb(var(--v-theme-primary));
  border-radius: 999px;
  box-shadow:
    0 0 8px 1px rgb(var(--v-theme-primary)),
    0 0 14px 2px rgba(var(--v-theme-primary), 0.45);
  pointer-events: none;
}

/* Preview vệt sáng elip mờ khi di chuột vào nút chưa chọn */
.status-toggle :deep(.v-btn:not(.v-btn--active):hover) {
  background: radial-gradient(
    ellipse 65% 55% at 50% 100%,
    rgba(var(--v-theme-primary), 0.12) 0%,
    transparent 75%
  ) !important;
}
.criteria-expansion-panel {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px !important;
  overflow: hidden;
}

.criteria-expansion-panel :deep(.v-expansion-panel-title) {
  min-height: 44px !important;
  height: 44px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.criteria-expansion-panel :deep(.v-expansion-panel-text) {
  padding: 0 !important;
}

.criteria-expansion-panel :deep(.expand-transition-enter-active),
.criteria-expansion-panel :deep(.expand-transition-leave-active) {
  transition:
    height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s ease !important;
}

.criteria-expansion-panel :deep(.expand-transition-enter-from),
.criteria-expansion-panel :deep(.expand-transition-leave-to) {
  opacity: 0;
}

.criteria-expansion-panel :deep(.v-expansion-panel-text__wrapper) {
  padding: 12px 16px 16px !important;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
