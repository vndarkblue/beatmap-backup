<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="currentLocale">{{ $t('backup.title') }}</h1>
    <v-card class="view-card">
      <v-card-text>
        <v-form class="view-form">
          <v-switch
            v-model="stableBackup"
            :label="$t('backup.stableBackup')"
            :lang="currentLocale"
            class="view-field"
            color="primary"
            hide-details
          ></v-switch>
          <v-switch
            v-model="lazerBackup"
            :label="$t('backup.lazerBackup')"
            :lang="currentLocale"
            class="view-field"
            color="primary"
            hide-details
          ></v-switch>
          <v-btn
            color="primary"
            block
            class="view-field"
            :lang="currentLocale"
            :disabled="!isButtonEnabled"
            :loading="isExporting"
            @click="handleExport"
          >
            {{ $t('backup.button') }}
          </v-btn>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n()
const currentLocale = computed(() => locale.value)

const stableBackup = ref(false)
const lazerBackup = ref(false)
const isButtonEnabled = computed(() => stableBackup.value || lazerBackup.value)
const isExporting = ref(false)
const statusMessage = ref('')
const isSuccess = ref(false)

const handleExport = async (): Promise<void> => {
  if (!isButtonEnabled.value) return

  try {
    isExporting.value = true
    statusMessage.value = ''

    const response = await window.electronAPI.exportData({
      stable: stableBackup.value,
      lazer: lazerBackup.value
    })

    if (!response?.success) {
      if (response?.error === 'cancelled') {
        throw new Error('cancelled')
      }
      throw new Error(response?.error || t('backup.error'))
    }

    isSuccess.value = true
    statusMessage.value = t('backup.success', { count: response.count })
  } catch (error: unknown) {
    isSuccess.value = false
    const msg = error instanceof Error ? error.message : t('backup.error')
    statusMessage.value = msg === 'cancelled' ? t('backup.cancelled') : msg
  } finally {
    isExporting.value = false
  }
}
</script>

<style scoped></style>
