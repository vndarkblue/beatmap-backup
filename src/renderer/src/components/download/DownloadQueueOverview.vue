<template>
  <div class="download-queue-overview">
    <!-- Queue Header & Action Controls -->
    <div class="d-flex align-center justify-space-between mb-4">
      <div>
        <div class="text-h6 font-weight-bold">{{ $t('download.manager.queueOverview') }}</div>
        <div
          class="text-caption font-weight-medium d-inline-flex align-center ga-1"
          :class="isPaused ? 'text-warning' : 'text-primary'"
        >
          <span
            class="queue-status-dot"
            :class="isPaused ? 'bg-warning' : 'bg-primary is-running'"
          ></span>
          <span>
            {{ isPaused ? $t('download.manager.paused') : $t('download.manager.running') }}
          </span>
        </div>
      </div>

      <div class="d-flex align-center ga-1">
        <v-btn
          v-if="!canDismiss"
          :icon="isPaused ? '$play' : '$pause'"
          variant="tonal"
          size="small"
          color="primary"
          :title="isPaused ? $t('download.manager.resume') : $t('download.manager.pause')"
          :lang="currentLocale"
          :disabled="confirmingStop"
          @click="$emit('toggle-pause')"
        ></v-btn>

        <template v-if="confirmingStop">
          <v-btn
            icon="$check"
            variant="flat"
            size="small"
            color="error"
            :title="$t('download.manager.stopConfirmYes')"
            :lang="currentLocale"
            @click="$emit('confirm-stop')"
          ></v-btn>
          <v-btn
            icon="$close"
            variant="tonal"
            size="small"
            :title="$t('download.manager.stopConfirmNo')"
            :lang="currentLocale"
            @click="$emit('cancel-stop')"
          ></v-btn>
        </template>
        <v-btn
          v-else-if="!canDismiss"
          icon="$stop"
          variant="tonal"
          size="small"
          color="error"
          :title="$t('download.manager.stop')"
          :lang="currentLocale"
          @click="$emit('request-stop')"
        ></v-btn>
        <v-btn
          v-if="canDismiss"
          icon="$close"
          variant="tonal"
          size="small"
          :title="$t('download.manager.closeManager')"
          :lang="currentLocale"
          @click="$emit('dismiss-queue')"
        ></v-btn>
      </div>
    </div>

    <!-- Progress Bar with Striped Animation -->
    <div class="mb-4 queue-progress-section pa-4 rounded-xl">
      <div class="d-flex justify-space-between align-center mb-2">
        <div class="text-caption font-weight-bold text-uppercase tracking-wide">
          {{ $t('download.manager.progress') }}
        </div>
        <div class="text-caption font-weight-bold">
          <span style="color: var(--accent-pink)">{{ completedFiles }}</span> / {{ totalFiles }}
          {{ $t('download.manager.files') }} ({{ Math.round(queueProgress) }}%)
        </div>
      </div>
      <v-progress-linear
        :model-value="queueProgress"
        color="primary"
        height="10"
        rounded
        class="anim-striped-bar"
        :class="{ 'is-paused': isPaused }"
      ></v-progress-linear>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  isPaused: boolean
  confirmingStop: boolean
  completedFiles: number
  totalFiles: number
  queueProgress: number
  currentLocale: string
  canDismiss?: boolean
}>()

defineEmits<{
  (e: 'toggle-pause'): void
  (e: 'request-stop'): void
  (e: 'confirm-stop'): void
  (e: 'cancel-stop'): void
  (e: 'dismiss-queue'): void
}>()
</script>

<style scoped>
.queue-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.queue-status-dot.is-running {
  box-shadow: 0 0 6px var(--accent-pink);
  animation: statusDotPulse 2s infinite ease-in-out;
}

@keyframes statusDotPulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.4;
    transform: scale(0.85);
  }
}

.queue-progress-section {
  background: rgba(127, 127, 127, 0.04);
  border: 1px solid var(--card-border-color);
  padding: 14px 18px !important;
  border-radius: 16px !important;
  overflow: hidden;
}
</style>
