<template>
  <AppIsland icon="$fileDocument" card-class="h-100 d-flex flex-column">
    <template #title>
      <div class="d-flex align-center justify-space-between w-100">
        <span>{{ $t('settings.diagnostic.title') }}</span>
      </div>
    </template>
    <div class="text-body-2 mb-2" :lang="currentLocale">
      {{ $t('settings.diagnostic.description') }}
    </div>

    <div
      v-if="feedbackMessage"
      class="text-caption mb-2 font-weight-medium"
      :class="isError ? 'text-error' : 'text-success'"
    >
      {{ feedbackMessage }}
    </div>

    <div class="d-flex justify-end ga-2 mt-auto pt-2 flex-wrap">
      <v-btn
        variant="tonal"
        color="secondary"
        size="small"
        :lang="currentLocale"
        :loading="isOpeningLog"
        @click="openLogFolder"
      >
        <v-icon icon="$folderOpen" start size="16" />
        {{ $t('settings.diagnostic.openLogFolder') }}
      </v-btn>

      <v-btn
        variant="tonal"
        color="primary"
        size="small"
        :lang="currentLocale"
        :loading="isCopying"
        @click="copyDiagnosticInfo"
      >
        <v-icon :icon="copied ? '$check' : '$contentSaveOutline'" start size="16" />
        {{ copied ? $t('settings.diagnostic.copied') : $t('settings.diagnostic.copyInfo') }}
      </v-btn>
    </div>
  </AppIsland>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIsland from '../common/AppIsland.vue'

defineProps<{
  currentLocale: string
}>()

const { t } = useI18n()
const isCopying = ref(false)
const copied = ref(false)
const isOpeningLog = ref(false)
const feedbackMessage = ref('')
const isError = ref(false)
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

const showFeedback = (msg: string, error = false): void => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackMessage.value = msg
  isError.value = error
  feedbackTimer = setTimeout(() => {
    feedbackMessage.value = ''
    feedbackTimer = null
  }, 3500)
}

const copyDiagnosticInfo = async (): Promise<void> => {
  try {
    isCopying.value = true
    const info = await window.electronAPI?.system?.getDiagnosticInfo?.()
    if (info) {
      await navigator.clipboard.writeText(info)
      copied.value = true
      showFeedback(t('settings.diagnostic.copySuccess'))
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } else {
      showFeedback(t('settings.diagnostic.copyFailed'), true)
    }
  } catch {
    showFeedback(t('settings.diagnostic.copyFailed'), true)
  } finally {
    isCopying.value = false
  }
}

const openLogFolder = async (): Promise<void> => {
  try {
    isOpeningLog.value = true
    await window.electronAPI?.system?.openLogFolder?.()
  } catch {
    // ignore
  } finally {
    isOpeningLog.value = false
  }
}
</script>
