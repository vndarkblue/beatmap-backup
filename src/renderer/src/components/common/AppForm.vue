<template>
  <v-form class="view-form" v-bind="$attrs">
    <slot />
  </v-form>
</template>

<script setup lang="ts">
defineOptions({
  inheritAttrs: false
})
</script>
