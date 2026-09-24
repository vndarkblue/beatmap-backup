<template>
  <AppForm>
    <!-- File Selection -->
    <PathField
      :model-value="selectedFileName"
      mode="file"
      :label="$t('download.selectFile')"
      :rules="[(v) => !!v || $t('download.fileRequired')]"
      :lang="currentLocale"
      @browse="$emit('select-file')"
    />

    <!-- Download Destination Path -->
    <PathField
      v-model="downloadPath"
      mode="directory"
      :label="$t('download.path')"
      clearable
      @clear="$emit('clear-download-path')"
      @browse="$emit('select-download-path')"
    />

    <!-- Download Action Button -->
    <v-btn
      color="primary"
      block
      size="large"
      class="download-start-btn font-weight-bold"
      :lang="currentLocale"
      :disabled="!isDownloadEnabled"
      :loading="isDownloading"
      @click="$emit('start-download')"
    >
      {{ $t('download.button') }}
    </v-btn>

    <!-- Indeterminate progress during initialization -->
    <v-progress-linear
      v-if="isDownloading"
      indeterminate
      color="primary"
      class="mt-3 anim-striped-bar"
      height="6"
      rounded
    ></v-progress-linear>

    <!-- Status Message -->
    <div
      v-if="statusMessage"
      class="text-center mt-3 font-weight-bold"
      :class="{ 'text-success': isSuccess, 'text-error': !isSuccess }"
    >
      {{ statusMessage }}
    </div>
  </AppForm>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppForm from '../common/AppForm.vue'
import PathField from '../common/PathField.vue'

const props = defineProps<{
  selectedFileName: string
  modelValueDownloadPath: string
  isDownloadEnabled: boolean
  isDownloading: boolean
  statusMessage: string
  isSuccess: boolean
  currentLocale: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValueDownloadPath', val: string): void
  (e: 'select-file'): void
  (e: 'clear-download-path'): void
  (e: 'select-download-path'): void
  (e: 'start-download'): void
}>()

const downloadPath = computed({
  get: () => props.modelValueDownloadPath,
  set: (val: string) => emit('update:modelValueDownloadPath', val)
})
</script>

<style scoped>
.download-start-btn {
  letter-spacing: 1px !important;
  border-radius: 12px !important;
  box-shadow: 0 4px 16px rgba(255, 102, 170, 0.25) !important;
  transition: all 0.2s ease !important;
}

.download-start-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(255, 102, 170, 0.35) !important;
}
</style>
