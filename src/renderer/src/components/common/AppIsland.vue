<template>
  <v-card class="view-card" :class="cardClass">
    <template v-if="$slots.title || title">
      <v-card-title class="text-h6">
        <slot name="title">{{ title }}</slot>
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
    cardClass?: string | string[] | Record<string, boolean>
    contentClass?: string | string[] | Record<string, boolean>
  }>(),
  {
    title: undefined,
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
</style>
