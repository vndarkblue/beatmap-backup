<template>
  <AppIsland icon="$backupRestore" card-class="h-100 d-flex flex-column">
    <template #title>
      <div class="d-flex align-center justify-space-between w-100">
        <span>{{ $t('settings.reset.all') }}</span>
      </div>
    </template>
    <div class="text-body-2 mb-2" :lang="currentLocale">{{ $t('settings.reset.warning') }}</div>
    <div v-if="resetFeedbackMessage" class="text-caption mb-2" :class="resetFeedbackClass">
      {{ resetFeedbackMessage }}
    </div>
    <div v-if="showResetAllConfirm" class="mb-3">
      <div class="text-caption text-warning mb-2" :lang="currentLocale">
        {{ $t('settings.reset.confirmWarning') }}
      </div>
      <div class="text-caption mb-2" :lang="currentLocale">
        {{ $t('settings.reset.holdHint') }}
      </div>
    </div>
    <div class="d-flex justify-end ga-2 mt-auto pt-2">
      <v-btn
        v-if="showResetAllConfirm"
        variant="text"
        :disabled="isResetting"
        :lang="currentLocale"
        @click="$emit('cancel-reset-all')"
      >
        {{ $t('settings.reset.cancel') }}
      </v-btn>
      <v-btn
        color="error"
        :variant="showResetAllConfirm ? 'flat' : 'outlined'"
        class="hold-confirm-btn"
        :style="confirmHoldStyle"
        :loading="isResetting"
        :disabled="isResetting"
        :lang="currentLocale"
        @click="$emit('request-reset-all')"
        @pointerdown.prevent="$emit('start-reset-all-hold')"
        @pointerup="$emit('cancel-reset-all-hold')"
        @pointerleave="$emit('cancel-reset-all-hold')"
        @pointercancel="$emit('cancel-reset-all-hold')"
      >
        {{ showResetAllConfirm ? $t('settings.reset.confirmAction') : $t('settings.reset.all') }}
      </v-btn>
    </div>
  </AppIsland>
</template>

<script setup lang="ts">
import AppIsland from '../common/AppIsland.vue'

defineProps<{
  currentLocale: string
  resetFeedbackMessage?: string
  resetFeedbackClass?: string
  showResetAllConfirm?: boolean
  isResetting?: boolean
  confirmHoldStyle?: Record<string, string>
}>()

defineEmits<{
  (e: 'cancel-reset-all'): void
  (e: 'request-reset-all'): void
  (e: 'start-reset-all-hold'): void
  (e: 'cancel-reset-all-hold'): void
}>()
</script>

<style scoped>
.hold-confirm-btn {
  --hold-progress: 0%;
  user-select: none;
}

.hold-confirm-btn :deep(.v-btn__overlay) {
  background: linear-gradient(
    to right,
    color-mix(in srgb, currentColor 22%, transparent) var(--hold-progress),
    transparent var(--hold-progress)
  ) !important;
  opacity: 1 !important;
}
</style>
