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

interface ExportError extends Error {
  message: string
}

const handleExport = async (): Promise<void> => {
  if (!isButtonEnabled.value) return

  try {
    console.log('Starting export with options:', {
      stable: stableBackup.value,
      lazer: lazerBackup.value
    })
    isExporting.value = true
    statusMessage.value = ''

    const response = await window.electronAPI.exportData({
      stable: stableBackup.value,
      lazer: lazerBackup.value
    })
    console.log('Export response:', response)

    if (!response?.success) {
      if (response?.error === 'cancelled') {
        throw new Error('cancelled')
      }
      throw new Error(response?.error || t('export.error'))
    }

    isSuccess.value = true
    statusMessage.value = t('export.success', { count: response.count })
  } catch (error: unknown) {
    console.error('Export failed in component:', error)
    isSuccess.value = false
    const exportError = error as ExportError
    statusMessage.value =
      exportError.message === 'cancelled'
        ? t('export.cancelled')
        : exportError.message || t('export.error')
  } finally {
    isExporting.value = false
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
</style>
