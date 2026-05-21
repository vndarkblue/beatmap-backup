<template>
  <v-card class="view-card" :class="cardClass">
    <template v-if="$slots.title || title || icon">
      <v-card-title class="text-h6 app-island-title">
        <div class="d-flex align-center w-100" :class="{ 'ga-2': icon }">
          <v-icon
            v-if="icon"
            :icon="icon"
            class="app-island-title__icon flex-shrink-0"
            size="22"
          />
          <div class="app-island-title__content flex-grow-1 min-w-0">
            <slot name="title">{{ title }}</slot>
          </div>
        </div>
      </v-card-title>
    </template>
    <v-card-text class="app-island-content" :class="contentClass">
      <slot />
    </v-card-text>
    <v-card-actions v-if="$slots.actions">
      <slot name="actions" />
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    icon?: string
    cardClass?: string | string[] | Record<string, boolean>
    contentClass?: string | string[] | Record<string, boolean>
  }>(),
  {
    title: undefined,
    icon: undefined,
    cardClass: undefined,
    contentClass: undefined
  }
)
</script>

<style scoped>
.app-island-content {
  padding-left: 28px;
  padding-right: 28px;
  padding-bottom: 26px;
}

.view-card {
  padding-top: 10px;
}

.app-island-title {
  font-weight: 600 !important;
}

.app-island-title__icon {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.app-island-title__content {
  line-height: 1;
}
</style>
