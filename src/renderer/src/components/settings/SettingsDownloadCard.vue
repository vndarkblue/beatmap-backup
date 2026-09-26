<template>
  <AppIsland card-class="mb-4" icon="$downloadOutline">
    <template #title>
      <div class="d-flex align-center justify-space-between w-100">
        <span>{{ $t('settings.downloadTab') }}</span>
        <v-btn
          icon="$restore"
          variant="text"
          size="small"
          :lang="currentLocale"
          :disabled="isDownloadDefault || isResetting"
          :title="$t('settings.reset.download')"
          @click="$emit('reset-download')"
        />
      </div>
    </template>

    <!-- Thread Count -->
    <div class="d-flex flex-column flex-sm-row align-sm-center mb-4">
      <div class="d-flex align-center mb-2 mb-sm-0 mr-sm-4 ga-2" :lang="currentLocale">
        <span class="text-subtitle-1" :lang="currentLocale">{{ threadCountLabel }}</span>
        <v-tooltip location="top">
          <template #activator="{ props: actProps }">
            <v-icon v-bind="actProps" icon="$helpCircleOutline" size="18" color="medium-emphasis" />
          </template>
          <span :lang="currentLocale">{{ $t('settings.downloadOptions.threadCountHelp') }}</span>
        </v-tooltip>
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
      <div class="download-settings-col mb-4 mb-sm-0">
        <div class="text-subtitle-1 mb-4 mt-1" :lang="currentLocale">
          {{ $t('settings.downloadOptions.ignoreExisting') }}
        </div>
        <v-checkbox
          v-model="removeFromStable"
          :label="$t('settings.downloadOptions.ignoreStable')"
          color="primary"
          hide-details
          class="view-field"
          :disabled="!isStablePathValid"
        ></v-checkbox>
        <v-checkbox
          v-model="removeFromLazer"
          :label="$t('settings.downloadOptions.ignoreLazer')"
          color="primary"
          hide-details
          class="view-field"
          :disabled="!isLazerPathValid"
        ></v-checkbox>
      </div>

      <v-divider vertical class="mx-4 d-none d-sm-flex"></v-divider>

      <!-- Other Options Column -->
      <div class="download-settings-col">
        <div class="text-subtitle-1 mb-4 mt-1" :lang="currentLocale">
          {{ $t('settings.downloadOptions.other') }}
        </div>
        <v-switch
          v-model="noVideo"
          :label="$t('settings.downloadOptions.noVideo')"
          color="primary"
          hide-details
          class="view-field pl-2"
        ></v-switch>
        <v-switch
          v-model="waitForDownloadsOnPause"
          :label="$t('settings.downloadOptions.waitForDownloads')"
          color="primary"
          hide-details
          class="view-field pl-2"
        ></v-switch>
        <div class="text-caption mt-1 ml-2 text-medium-emphasis" :lang="currentLocale">
          {{ waitForDownloadsHelpText }}
        </div>
      </div>
    </div>

    <v-divider class="settings-section-divider my-5" />

    <!-- BeatConnect API Token Section -->
    <div class="mb-5">
      <div class="d-flex align-center justify-space-between mb-2 flex-wrap ga-2">
        <div class="d-flex align-center ga-2">
          <span class="text-subtitle-1 font-weight-bold">BeatConnect API</span>
          <v-tooltip location="top">
            <template #activator="{ props: actProps }">
              <v-icon
                v-bind="actProps"
                icon="$helpCircleOutline"
                size="18"
                color="medium-emphasis"
              />
            </template>
            <span :lang="currentLocale">{{
              $t('settings.downloadOptions.beatconnectTokenHelp')
            }}</span>
          </v-tooltip>
        </div>

        <v-btn
          variant="tonal"
          size="small"
          color="primary"
          class="patreon-btn text-caption text-none font-weight-semibold px-3"
          @click="openExternalUrl('https://beatconnect.io/api-info')"
        >
          {{ $t('settings.downloadOptions.beatconnectPatreonLink') }}
          <v-icon icon="$openInNew" end size="14" />
        </v-btn>
      </div>

      <div class="text-caption text-medium-emphasis mb-3" :lang="currentLocale">
        {{ $t('settings.downloadOptions.beatconnectTokenSubtitle') }}
      </div>

      <div
        v-if="!hasBeatconnectToken || isEditingToken"
        class="token-input-row d-flex align-center ga-2 flex-wrap flex-sm-nowrap"
      >
        <v-text-field
          v-model="tokenInput"
          :type="showToken ? 'text' : 'password'"
          :append-inner-icon="showToken ? '$eyeOff' : '$eye'"
          variant="outlined"
          density="compact"
          rounded="lg"
          spellcheck="false"
          autocomplete="off"
          :placeholder="$t('settings.downloadOptions.beatconnectTokenPlaceholder')"
          hide-details="auto"
          class="view-field flex-grow-1 token-text-field"
          @click:append-inner="showToken = !showToken"
          @keydown.enter="handleSaveToken"
        />
        <v-btn
          color="primary"
          size="small"
          height="40"
          rounded="lg"
          class="token-action-btn font-weight-bold text-none"
          :disabled="!tokenInput.trim()"
          @click="handleSaveToken"
        >
          {{ $t('settings.downloadOptions.beatconnectTokenSave') }}
        </v-btn>
        <v-btn
          v-if="isEditingToken"
          variant="tonal"
          size="small"
          height="40"
          rounded="lg"
          class="token-action-btn font-weight-bold text-none"
          @click="cancelEditingToken"
        >
          {{ $t('settings.downloadOptions.beatconnectTokenCancel') }}
        </v-btn>
      </div>

      <div
        v-else
        class="token-status-card d-flex align-center justify-space-between flex-wrap ga-3"
      >
        <div class="d-flex align-center ga-3 min-w-0">
          <div class="token-status-icon-wrap flex-shrink-0">
            <v-icon icon="$checkCircle" size="20" color="success" />
          </div>
          <div class="d-flex flex-column min-w-0">
            <span class="token-status-title font-weight-semibold text-body-2 text-truncate">
              {{ $t('settings.downloadOptions.beatconnectTokenSaved') }}
            </span>
            <span class="token-status-hint text-caption">
              {{ $t('settings.downloadOptions.beatconnectTokenActiveHint') }}
            </span>
          </div>
        </div>
        <div class="d-flex align-center ga-2 flex-shrink-0">
          <v-btn
            variant="tonal"
            size="small"
            class="token-btn font-weight-semibold text-none"
            @click="startEditingToken"
          >
            {{ $t('settings.downloadOptions.beatconnectTokenChange') }}
          </v-btn>
          <v-btn
            variant="text"
            size="small"
            color="error"
            class="token-btn font-weight-semibold text-none"
            @click="handleClearToken"
          >
            {{ $t('settings.downloadOptions.beatconnectTokenClear') }}
          </v-btn>
        </div>
      </div>
    </div>

    <v-divider class="settings-section-divider my-5" />

    <!-- Mirror Network Status Section -->
    <div>
      <div class="d-flex align-center justify-space-between mb-2">
        <div class="d-flex align-center ga-2">
          <span class="text-subtitle-1 font-weight-bold">{{
            $t('settings.downloadOptions.mirrorsNetwork')
          }}</span>
          <v-tooltip location="top">
            <template #activator="{ props: actProps }">
              <v-icon
                v-bind="actProps"
                icon="$helpCircleOutline"
                size="18"
                color="medium-emphasis"
              />
            </template>
            <span :lang="currentLocale">{{
              $t('settings.downloadOptions.mirrorsNetworkHelp')
            }}</span>
          </v-tooltip>
        </div>
        <v-btn
          icon="$refresh"
          variant="text"
          size="small"
          :loading="isLoadingMirrors"
          :title="$t('settings.downloadOptions.mirrorsRefresh')"
          @click="$emit('refresh-mirrors')"
        />
      </div>

      <div class="text-caption text-medium-emphasis mb-3" :lang="currentLocale">
        {{ $t('settings.downloadOptions.mirrorsNetworkSubtitle') }}
      </div>

      <div
        v-if="isLoadingMirrors && (!mirrorStatuses || mirrorStatuses.length === 0)"
        class="d-flex justify-center py-6"
      >
        <v-progress-circular indeterminate color="primary" size="32" />
      </div>

      <v-row v-else dense>
        <v-col v-for="mirror in mirrorStatuses || []" :key="mirror.name" cols="12" sm="6">
          <div
            class="mirror-card d-flex align-center justify-space-between pa-3"
            :class="{
              'is-online': mirror.isOnline,
              'is-blocked': mirror.isWarpBlocked,
              'is-offline': !mirror.isOnline && !mirror.isWarpBlocked
            }"
          >
            <div class="d-flex align-center ga-3 text-truncate">
              <div
                class="mirror-status-dot"
                :class="{
                  'dot-online': mirror.isOnline,
                  'dot-blocked': mirror.isWarpBlocked,
                  'dot-offline': !mirror.isOnline && !mirror.isWarpBlocked
                }"
              />
              <div class="d-flex flex-column min-w-0">
                <div class="d-flex align-center ga-2">
                  <span class="mirror-name font-weight-semibold text-body-2 text-truncate">
                    {{ mirror.name }}
                  </span>
                  <v-tooltip v-if="mirror.isWarpBlocked" location="top">
                    <template #activator="{ props: tipProps }">
                      <v-icon v-bind="tipProps" icon="$alert" size="14" color="warning" />
                    </template>
                    <span>{{ $t('settings.downloadOptions.mirrorWarpBlocked') }}</span>
                  </v-tooltip>
                </div>
                <span
                  v-if="mirror.name === 'BeatConnect'"
                  class="text-caption text-medium-emphasis text-truncate"
                >
                  {{ hasBeatconnectToken ? 'BeatConnect API (5x)' : 'Community Free (2x)' }}
                </span>
              </div>
            </div>
            <div class="d-flex align-center ga-2 flex-shrink-0">
              <span
                v-if="mirror.isOnline && mirror.responseTimeMs !== null"
                class="mirror-ping font-mono text-caption"
                :class="getPingClass(mirror.responseTimeMs)"
              >
                {{ mirror.responseTimeMs }}ms
              </span>
              <v-chip
                size="x-small"
                :variant="mirror.name === 'BeatConnect' && hasBeatconnectToken ? 'flat' : 'tonal'"
                :color="getMirrorChipColor(mirror)"
                class="mirror-cap-chip font-weight-bold"
              >
                {{ getMirrorCapText(mirror.name) }}
              </v-chip>
            </div>
          </div>
        </v-col>
      </v-row>
    </div>
  </AppIsland>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import AppIsland from '../common/AppIsland.vue'
import type { MirrorStatus } from '../../../../preload/electronApiTypes'

const props = defineProps<{
  modelValueThreadCount: number
  modelValueRemoveFromStable: boolean
  modelValueRemoveFromLazer: boolean
  modelValueNoVideo: boolean
  modelValueWaitForDownloadsOnPause: boolean
  threadCountLabel: string
  isDownloadDefault: boolean
  isResetting: boolean
  isStablePathValid: boolean
  isLazerPathValid: boolean
  waitForDownloadsHelpText: string
  currentLocale: string
  hasBeatconnectToken?: boolean
  mirrorStatuses?: MirrorStatus[]
  isLoadingMirrors?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValueThreadCount', val: number): void
  (e: 'update:modelValueRemoveFromStable', val: boolean): void
  (e: 'update:modelValueRemoveFromLazer', val: boolean): void
  (e: 'update:modelValueNoVideo', val: boolean): void
  (e: 'update:modelValueWaitForDownloadsOnPause', val: boolean): void
  (e: 'reset-download'): void
  (e: 'save-beatconnect-token', token: string): void
  (e: 'clear-beatconnect-token'): void
  (e: 'refresh-mirrors'): void
}>()

const threadCount = computed({
  get: () => props.modelValueThreadCount,
  set: (val: number) => emit('update:modelValueThreadCount', val)
})

const removeFromStable = computed({
  get: () => props.modelValueRemoveFromStable,
  set: (val: boolean) => emit('update:modelValueRemoveFromStable', val)
})

const removeFromLazer = computed({
  get: () => props.modelValueRemoveFromLazer,
  set: (val: boolean) => emit('update:modelValueRemoveFromLazer', val)
})

const noVideo = computed({
  get: () => props.modelValueNoVideo,
  set: (val: boolean) => emit('update:modelValueNoVideo', val)
})

const waitForDownloadsOnPause = computed({
  get: () => props.modelValueWaitForDownloadsOnPause,
  set: (val: boolean) => emit('update:modelValueWaitForDownloadsOnPause', val)
})

const tokenInput = ref('')
const showToken = ref(false)
const isEditingToken = ref(false)

const handleSaveToken = (): void => {
  const trimmed = tokenInput.value.trim()
  if (trimmed) {
    emit('save-beatconnect-token', trimmed)
    tokenInput.value = ''
    isEditingToken.value = false
  }
}

const handleClearToken = (): void => {
  emit('clear-beatconnect-token')
  tokenInput.value = ''
  isEditingToken.value = false
}

const startEditingToken = (): void => {
  isEditingToken.value = true
  tokenInput.value = ''
}

const cancelEditingToken = (): void => {
  isEditingToken.value = false
  tokenInput.value = ''
}

const openExternalUrl = (url: string): void => {
  window.electronAPI?.system?.openExternal?.(url)
}

const getMirrorCapText = (name: string): string => {
  if (name === 'catboy.best') return 'Max 2'
  if (name === 'BeatConnect') {
    return props.hasBeatconnectToken ? 'Max 5 (Auth)' : 'Max 2 (Unauth)'
  }
  return 'Max 3'
}

const getMirrorChipColor = (mirror: MirrorStatus): string => {
  if (mirror.isWarpBlocked) return 'warning'
  if (!mirror.isOnline) return 'default'
  if (mirror.name === 'BeatConnect' && props.hasBeatconnectToken) return 'primary'
  return 'secondary'
}

const getPingClass = (ping: number): string => {
  if (ping < 250) return 'ping-good'
  if (ping < 600) return 'ping-fair'
  return 'ping-slow'
}
</script>

<style scoped>
.download-settings-col {
  width: 100%;
}

@media (min-width: 600px) {
  .download-settings-col {
    flex: 1 1 0% !important;
    min-width: 0 !important;
  }
}

.settings-section-divider {
  border-color: var(--card-border-color) !important;
  opacity: 0.6;
}

.patreon-btn {
  border-radius: 8px !important;
  letter-spacing: 0.01em;
}

.token-action-btn,
.token-btn {
  border-radius: 8px !important;
  transition: all 0.2s ease;
}

/* Token Configured Banner */
.token-status-card {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.28);
  transition: all 0.2s ease;
}

:deep(.v-theme--dark) .token-status-card,
.v-theme--dark .token-status-card {
  background: rgba(52, 211, 153, 0.08) !important;
  border: 1px solid rgba(52, 211, 153, 0.3) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

:deep(.v-theme--light) .token-status-card,
.v-theme--light .token-status-card {
  background: rgba(5, 150, 105, 0.06) !important;
  border: 1px solid rgba(5, 150, 105, 0.22) !important;
}

.token-status-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.16);
}

:deep(.v-theme--dark) .token-status-icon-wrap,
.v-theme--dark .token-status-icon-wrap {
  background: rgba(52, 211, 153, 0.16);
}

:deep(.v-theme--light) .token-status-icon-wrap,
.v-theme--light .token-status-icon-wrap {
  background: rgba(5, 150, 105, 0.12);
}

.token-status-title {
  color: var(--main-text-color) !important;
  line-height: 1.3;
}

.token-status-hint {
  color: var(--text-muted-color) !important;
  line-height: 1.2;
}

/* Mirror Cards */
.mirror-card {
  background: rgba(127, 127, 127, 0.04);
  border: 1px solid var(--card-border-color);
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 52px;
}

:deep(.v-theme--dark) .mirror-card,
.v-theme--dark .mirror-card {
  background: rgba(255, 255, 255, 0.025);
}

.mirror-card:hover {
  transform: translateY(-1px);
  background: rgba(127, 127, 127, 0.08);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.mirror-card.is-online:hover {
  border-color: rgba(var(--v-theme-primary), 0.35);
}

.mirror-card.is-blocked {
  border-color: rgba(245, 158, 11, 0.3);
}

.mirror-card.is-offline {
  opacity: 0.65;
}

.mirror-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-online {
  background-color: var(--accent-green, #34d399);
  box-shadow: 0 0 8px var(--accent-green, #34d399);
}

.dot-blocked {
  background-color: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
}

.dot-offline {
  background-color: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.mirror-name {
  color: var(--main-text-color);
}

.mirror-ping {
  font-size: 0.75rem;
  letter-spacing: -0.01em;
}

.ping-good {
  color: var(--accent-green, #34d399);
}

.ping-fair {
  color: #fbbf24;
}

.ping-slow {
  color: #f87171;
}

.mirror-cap-chip {
  letter-spacing: 0.02em;
  border-radius: 6px !important;
}
</style>
