<template>
  <div class="view-container">
    <h1 class="text-h4 mb-4" :lang="lang">{{ title }}</h1>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  lang?: string
}>()
</script>

<style scoped>
.view-container {
  position: relative;
  width: 100%;
  min-height: 100%;
}
</style>
