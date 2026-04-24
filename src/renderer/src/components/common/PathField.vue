<template>
  <v-text-field
    :model-value="modelValue"
    :label="label"
    :prepend-icon="prependIcon"
    :readonly="readonly"
    :class="fieldClass"
    :lang="lang"
    :rules="rules"
    :clearable="clearable"
    :disabled="disabled"
    @update:model-value="onUpdate"
    @click:clear="onClear"
  >
    <template #append>
      <v-btn
        :icon="appendIcon"
        variant="text"
        :title="computedBrowseTitle"
        :disabled="disabled"
        @click="emit('browse')"
      />
    </template>
  </v-text-field>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { VTextField } from 'vuetify/components'

type FieldMode = 'file' | 'directory'
type TextFieldRules = VTextField['$props']['rules']

const props = withDefaults(
  defineProps<{
    modelValue: string
    label: string
    mode: FieldMode
    browseTitle?: string
    readonly?: boolean
    clearable?: boolean
    disabled?: boolean
    lang?: string
    rules?: TextFieldRules
    fieldClass?: string | string[] | Record<string, boolean>
  }>(),
  {
    browseTitle: undefined,
    readonly: true,
    clearable: false,
    disabled: false,
    lang: undefined,
    rules: undefined,
    fieldClass: 'view-field'
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  browse: []
  clear: []
}>()

const prependIcon = computed(() => (props.mode === 'file' ? 'mdi-file-document' : 'mdi-folder'))
const appendIcon = computed(() => (props.mode === 'file' ? 'mdi-file-search' : 'mdi-folder-open'))
const computedBrowseTitle = computed(() => props.browseTitle ?? props.label)

const onUpdate = (value: string): void => {
  emit('update:modelValue', value)
}

const onClear = (): void => {
  emit('clear')
}
</script>
