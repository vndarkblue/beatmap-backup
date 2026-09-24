<template>
  <v-dialog v-model="dialogVisible" max-width="520" persistent>
    <v-card class="recovery-dialog">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="$restoreAlert" color="primary" />
        <span>{{ $t('download.recovery.title') }}</span>
      </v-card-title>
      <v-card-text>
        <div class="mb-2">
          {{
            $t('download.recovery.description', {
              total: recoveryState?.taskCount ?? 0
            })
          }}
        </div>
        <div class="text-medium-emphasis mb-3">{{ $t('download.recovery.hint') }}</div>
        <div class="text-medium-emphasis">
          {{
            $t('download.recovery.stats', {
              waiting: recoveryState?.waitingCount ?? 0,
              downloading: recoveryState?.downloadingCount ?? 0
            })
          }}
        </div>
        <div v-if="showDiscardConfirm" class="recovery-warning mt-4">
          <v-icon icon="$alert" size="18" />
          {{ $t('download.recovery.discardConfirm') }}
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          :color="showDiscardConfirm ? 'error' : undefined"
          variant="text"
          :disabled="recoveryActionLoading"
          @click="$emit('discard')"
        >
          {{
            showDiscardConfirm
              ? $t('download.recovery.discardConfirmButton')
              : $t('download.recovery.discard')
          }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="recoveryActionLoading"
          @click="$emit('resume')"
        >
          {{ $t('download.recovery.resume') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RecoveryState } from '../../../../preload/electronApiTypes'

const props = defineProps<{
  modelValue: boolean
  recoveryState: RecoveryState | null
  showDiscardConfirm: boolean
  recoveryActionLoading: boolean
  currentLocale: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'discard'): void
  (e: 'resume'): void
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
})
</script>

<style scoped>
.recovery-dialog {
  border-radius: 16px !important;
  background: rgb(var(--v-theme-surface)) !important;
  border: 1px solid rgba(127, 127, 127, 0.25) !important;
  padding: 8px 10px 6px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45) !important;
}

.recovery-dialog,
.recovery-dialog :deep(*) {
  font-family: var(--font-family) !important;
}

.recovery-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--v-theme-error));
  font-size: 0.95rem;
}
</style>
