<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ t('filter.title') }}</h1>

    <!-- Game Mode Section -->
    <v-card class="view-card mb-4">
      <v-card-title class="text-h6" :lang="currentLocale">{{ t('filter.gameMode') }}</v-card-title>
      <v-card-text>
        <v-chip-group v-model="selectedModes" column multiple color="primary">
          <v-chip value="osu" filter>osu!</v-chip>
          <v-chip value="taiko" filter>Taiko</v-chip>
          <v-chip value="catch" filter>Catch</v-chip>
          <v-chip value="mania" filter>Mania</v-chip>
        </v-chip-group>
      </v-card-text>
    </v-card>

    <!-- Difficulty Section -->
    <v-card v-if="selectedModes.length > 0" class="view-card mb-4">
      <v-card-title class="text-h6" :lang="currentLocale">{{
        t('filter.difficulty')
      }}</v-card-title>
      <v-card-text>
        <div class="mb-4">
          <div class="text-subtitle-1 mb-2" :lang="currentLocale">{{ t('filter.status') }}</div>
          <v-btn-toggle
            v-model="selectedStatus"
            color="primary"
            class="d-flex flex-wrap status-toggle"
            style="gap: 1px; height: 4rem"
          >
            <v-btn
              v-for="opt in statusOptions"
              :key="opt"
              :value="opt"
              class="flex-grow-1 status-btn"
              variant="outlined"
            >
              {{ t(`filter.statusOptions.${opt}`) }}
            </v-btn>
          </v-btn-toggle>
        </div>

        <v-tabs v-model="activeTab" color="primary" align-tabs="start" class="mb-4">
          <v-tab v-for="mode in selectedModes" :key="mode" :value="mode" style="min-width: 120px">
            <span class="mode-icon">{{ modeIcons[mode as keyof typeof modeIcons] }}</span>
            {{ mode.charAt(0).toUpperCase() + mode.slice(1) }}
          </v-tab>
        </v-tabs>

        <v-window v-model="activeTab" :touch="false">
          <v-window-item v-for="mode in selectedModes" :key="mode" :value="mode">
            <template v-for="stat in statConfigs" :key="stat.key">
              <div v-if="stat.showIn.includes(mode as string)" class="d-flex align-center mb-4">
                <div
                  class="text-subtitle-2 mr-4 text-right"
                  style="width: 80px"
                  :lang="currentLocale"
                >
                  {{
                    stat.key === 'cs' && mode === 'mania'
                      ? t('filter.keys')
                      : t(`filter.${stat.labelKey}`)
                  }}
                </div>
                <v-text-field
                  v-model.number="
                    modeStats[mode as keyof typeof modeStats][
                      stat.key as keyof typeof defaultStats
                    ][0]
                  "
                  type="number"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="text-center"
                  style="max-width: 90px"
                />
                <v-range-slider
                  v-model="
                    modeStats[mode as keyof typeof modeStats][stat.key as keyof typeof defaultStats]
                  "
                  :min="stat.min"
                  :max="stat.max"
                  :step="stat.step"
                  hide-details
                  class="mx-4 flex-grow-1"
                  color="primary"
                />
                <v-text-field
                  v-model.number="
                    modeStats[mode as keyof typeof modeStats][
                      stat.key as keyof typeof defaultStats
                    ][1]
                  "
                  type="number"
                  density="compact"
                  variant="outlined"
                  hide-details
                  class="text-center"
                  style="max-width: 90px"
                />
              </div>
            </template>
          </v-window-item>
        </v-window>
      </v-card-text>
    </v-card>

    <!-- Beatmap Info Section -->
    <v-card class="view-card mb-4">
      <v-card-title class="text-h6" :lang="currentLocale">{{
        t('filter.beatmapInfo')
      }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="artist"
              :label="t('filter.artist')"
              prepend-inner-icon="mdi-account-music"
              variant="outlined"
              density="comfortable"
              hide-details
              class="mb-3"
              :lang="currentLocale"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="mapTitle"
              :label="t('filter.mapTitle')"
              prepend-inner-icon="mdi-music-note"
              variant="outlined"
              density="comfortable"
              hide-details
              class="mb-3"
              :lang="currentLocale"
            />
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field
              v-model="mapper"
              :label="t('filter.mapper')"
              prepend-inner-icon="mdi-account-edit"
              variant="outlined"
              density="comfortable"
              hide-details
              class="mb-3"
              :lang="currentLocale"
            />
          </v-col>
        </v-row>

        <v-row align="end">
          <v-col cols="12" lg="6">
            <div class="d-flex align-center mb-2">
              <div class="text-subtitle-1 mr-4" :lang="currentLocale">{{ t('filter.length') }}</div>
              <v-switch
                v-model="isDrainLength"
                :label="t('filter.drainLength')"
                color="primary"
                hide-details
                density="compact"
                class="ml-auto"
                :lang="currentLocale"
              />
            </div>
            <div class="d-flex align-center">
              <v-text-field
                v-model.number="lengthRange[0]"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 90px"
              >
                <template #append-inner
                  ><span class="text-caption text-grey" :lang="currentLocale">{{
                    t('filter.seconds')
                  }}</span></template
                >
              </v-text-field>
              <v-range-slider
                v-model="lengthRange"
                :min="0"
                :max="1200"
                :step="1"
                hide-details
                class="mx-4 flex-grow-1"
                color="primary"
              />
              <v-text-field
                v-model.number="lengthRange[1]"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 90px"
              >
                <template #append-inner
                  ><span class="text-caption text-grey" :lang="currentLocale">{{
                    t('filter.seconds')
                  }}</span></template
                >
              </v-text-field>
            </div>
          </v-col>
          <v-col cols="12" lg="6" class="mt-4 mt-lg-0">
            <div class="text-subtitle-1 mb-2" :lang="currentLocale">{{ t('filter.maxCombo') }}</div>
            <div class="d-flex align-center flex-wrap">
              <v-text-field
                v-model.number="maxCombo[0]"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 90px; min-width: 80px"
              />
              <v-range-slider
                v-model="maxCombo"
                :min="0"
                :max="10000"
                :step="1"
                hide-details
                class="mx-4 flex-grow-1"
                style="min-width: 150px"
                color="primary"
              />
              <v-text-field
                v-model.number="maxCombo[1]"
                type="number"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 90px; min-width: 80px"
              />
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Metadata Section -->
    <v-card class="view-card mb-4">
      <v-card-title class="text-h6" :lang="currentLocale">{{ t('filter.metadata') }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" sm="6">
            <v-select
              v-model="selectedGenre"
              :items="genreOptions"
              :item-title="(item: string) => t(`filter.genreOptions.${item}`)"
              :label="t('filter.genre')"
              variant="outlined"
              density="comfortable"
              hide-details
              class="mb-3"
              :lang="currentLocale"
            />
          </v-col>
          <v-col cols="12" sm="6">
            <v-select
              v-model="selectedLanguage"
              :items="languageOptions"
              :item-title="(item: string) => t(`filter.languageOptions.${item}`)"
              :label="t('filter.language')"
              variant="outlined"
              density="comfortable"
              hide-details
              class="mb-3"
              :lang="currentLocale"
            />
          </v-col>
        </v-row>
        <v-row align="end">
          <v-col cols="12" sm="5" lg="4">
            <v-text-field
              v-model="source"
              :label="t('filter.source')"
              variant="outlined"
              density="comfortable"
              hide-details
              class="mb-3 mb-sm-0"
              :lang="currentLocale"
            />
          </v-col>
          <v-col cols="12" sm="7" lg="8">
            <v-combobox
              v-model="tags"
              :placeholder="t('filter.addTag')"
              :label="t('filter.tags')"
              multiple
              variant="outlined"
              density="comfortable"
              hide-details
              chips
              closable-chips
              menu-icon=""
              :delimiters="[',', ' ', 'Enter']"
              class="tags-input"
              :lang="currentLocale"
            >
              <template #chip="{ props, item }">
                <v-chip v-bind="props" variant="tonal" size="small" :text="item.value" />
              </template>
            </v-combobox>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Action Buttons -->
    <div class="d-flex justify-end mb-8">
      <v-btn variant="outlined" color="error" class="mr-3" :lang="currentLocale" @click="resetAll">
        {{ t('filter.resetAll') }}
      </v-btn>
      <v-btn color="primary" :lang="currentLocale" @click="applyFilter">
        {{ t('filter.applyFilter') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const currentLocale = computed(() => locale.value)

// Game Mode
const selectedModes = ref(['osu'])

// Game Mode Icons
const modeIcons = {
  osu: '\uE800',
  catch: '\uE801',
  mania: '\uE802',
  taiko: '\uE803'
}

// Difficulty Status
const statusOptions = [
  'hasLeaderboard',
  'ranked',
  'loved',
  'approved',
  'unranked',
  'wip',
  'pending',
  'graveyard',
  'any'
]
const selectedStatus = ref('any')

// Stats Configuration Data
const defaultStats = {
  stars: [0, 15] as [number, number],
  bpm: [0, 500] as [number, number],
  cs: [0, 10] as [number, number],
  ar: [0, 10] as [number, number],
  hp: [0, 10] as [number, number],
  od: [0, 10] as [number, number]
}

const statConfigs = [
  {
    key: 'stars',
    labelKey: 'stars',
    min: 0,
    max: 15,
    step: 0.1,
    showIn: ['osu', 'taiko', 'catch', 'mania']
  },
  {
    key: 'bpm',
    labelKey: 'bpm',
    min: 0,
    max: 500,
    step: 1,
    showIn: ['osu', 'taiko', 'catch', 'mania']
  },
  { key: 'cs', labelKey: 'cs', min: 0, max: 10, step: 0.1, showIn: ['osu', 'catch', 'mania'] },
  { key: 'ar', labelKey: 'ar', min: 0, max: 10, step: 0.1, showIn: ['osu', 'catch'] },
  {
    key: 'hp',
    labelKey: 'hp',
    min: 0,
    max: 10,
    step: 0.1,
    showIn: ['osu', 'taiko', 'catch', 'mania']
  },
  {
    key: 'od',
    labelKey: 'od',
    min: 0,
    max: 10,
    step: 0.1,
    showIn: ['osu', 'taiko', 'catch', 'mania']
  }
]

const modeStats = reactive({
  osu: JSON.parse(JSON.stringify(defaultStats)),
  taiko: JSON.parse(JSON.stringify(defaultStats)),
  catch: JSON.parse(JSON.stringify(defaultStats)),
  mania: JSON.parse(JSON.stringify(defaultStats))
})

const activeTab = ref('osu')

// Ensure active tab is valid when selected modes change
watch(selectedModes, (newModes) => {
  if (newModes.length > 0 && !newModes.includes(activeTab.value)) {
    activeTab.value = newModes[0]
  }
})

// Beatmap Info
const artist = ref('')
const mapTitle = ref('')
const mapper = ref('')
const lengthRange = ref<[number, number]>([0, 600])
const isDrainLength = ref(false)
const maxCombo = ref<[number, number]>([0, 5000])

// Metadata
const genreOptions = [
  'any',
  'unspecified',
  'videoGame',
  'anime',
  'rock',
  'pop',
  'other',
  'novelty',
  'hipHop',
  'electronic',
  'metal',
  'classical',
  'folk',
  'jazz'
]
const selectedGenre = ref('any')

const languageOptions = [
  'any',
  'english',
  'japanese',
  'chinese',
  'instrumental',
  'korean',
  'french',
  'german',
  'swedish',
  'spanish',
  'italian',
  'russian',
  'polish',
  'other'
]
const selectedLanguage = ref('any')

const source = ref('')
const tags = ref<string[]>([])

const resetAll = (): void => {
  selectedModes.value = ['osu']
  selectedStatus.value = 'any'
  activeTab.value = 'osu'

  Object.keys(modeStats).forEach((mode) => {
    modeStats[mode as keyof typeof modeStats] = JSON.parse(JSON.stringify(defaultStats))
  })

  artist.value = ''
  mapTitle.value = ''
  mapper.value = ''
  lengthRange.value = [0, 600]
  isDrainLength.value = false
  maxCombo.value = [0, 5000]

  selectedGenre.value = 'any'
  selectedLanguage.value = 'any'
  source.value = ''
  tags.value = []
}

const applyFilter = (): void => {
  console.log('Applying filter...', {
    selectedModes: selectedModes.value,
    selectedStatus: selectedStatus.value,
    modeStats,
    artist: artist.value,
    mapTitle: mapTitle.value,
    mapper: mapper.value,
    lengthRange: lengthRange.value,
    isDrainLength: isDrainLength.value,
    maxCombo: maxCombo.value,
    selectedGenre: selectedGenre.value,
    selectedLanguage: selectedLanguage.value,
    source: source.value,
    tags: tags.value
  })
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap');

@font-face {
  font-family: 'osu-extra';
  src: url('../assets/fonts/extra.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}

.mode-icon {
  font-family: 'osu-extra';
  font-size: 1.25rem;
  margin-right: 8px;
  font-style: normal;
}

:deep(.status-toggle) {
  border: none !important;
}

:deep(.status-btn) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
  border-radius: 4px !important;
}

.view-container {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}
.view-card {
  border-radius: 8px;
}
.text-h4 {
  font-family: var(--font-default) !important;
  font-weight: 600 !important;
}
.text-h6 {
  font-family: var(--font-default) !important;
  font-weight: 600 !important;
}
.text-subtitle-1,
.text-subtitle-2 {
  font-family: var(--font-default) !important;
  font-weight: 500 !important;
}

:deep(.tags-input .v-messages__message) {
  text-align: right;
  width: 100%;
}

/* Reset global button styles leaking into Vuetify chip internals */
:deep(.tags-input button) {
  padding: unset;
  border: unset;
  border-radius: unset;
  background-color: unset;
  transition: unset;
}
</style>
