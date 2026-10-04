<template>
  <AppIsland card-class="mb-4" icon="$cogOutline">
    <template #title>
      <div class="d-flex align-center justify-space-between w-100">
        <span>{{ $t('settings.general') }}</span>
        <v-btn
          icon="$restore"
          variant="text"
          size="small"
          :lang="currentLocale"
          :disabled="isGeneralDefault || isResetting"
          :title="$t('settings.reset.general')"
          @click="resetGeneralSettings"
        />
      </div>
    </template>
    <AppForm>
      <PathField
        v-model="osuStablePath"
        mode="directory"
        :label="$t('settings.paths.osuStable')"
        :browse-title="$t('settings.paths.selectFolder')"
        :placeholder="osuStablePlaceholder"
        @browse="selectOsuStablePath"
      />

      <PathField
        v-model="osuLazerPath"
        mode="directory"
        :label="$t('settings.paths.osuLazer')"
        :browse-title="$t('settings.paths.selectFolder')"
        :placeholder="osuLazerPlaceholder"
        @browse="selectOsuLazerPath"
      />
      <div
        v-if="osuLazerResolvedDataPath && osuLazerResolvedDataPath !== osuLazerPath"
        class="text-caption text-medium-emphasis mt-n2 mb-2 ml-1"
        :lang="currentLocale"
      >
        {{ $t('settings.paths.lazerRedirected', { path: osuLazerResolvedDataPath }) }}
      </div>
      <v-alert
        v-if="showAutoDetectWarningInline"
        type="warning"
        variant="tonal"
        density="compact"
        class="mt-n2 mb-2"
        :text="$t('settings.paths.autoDetectFailed')"
      />
    </AppForm>
    <v-divider class="my-4"></v-divider>
    <!-- Language Selection -->
    <v-select
      v-model="currentLocale"
      :items="availableLocales"
      :label="$t('language.title')"
      prepend-icon="$translate"
      item-title="text"
      item-value="value"
      class="view-field"
      :lang="currentLocale"
    >
      <template #item="{ props: itemProps, item }">
        <v-list-item v-bind="itemProps" :title="undefined" :lang="item.raw.value">
          <template #prepend>
            <img
              :src="flagMap[item.raw.flagCode]"
              class="flag-icon mr-2"
              alt=""
              width="20"
              height="15"
            />
          </template>
          <span :lang="item.raw.value">{{ item.raw.text }}</span>
        </v-list-item>
      </template>
      <template #selection="{ item }">
        <img :src="flagMap[item.raw.flagCode]" class="flag-icon" alt="" width="20" height="15" />
        <span class="ml-2" :lang="item.raw.value">{{ item.raw.text }}</span>
      </template>
    </v-select>
  </AppIsland>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIsland from '../common/AppIsland.vue'
import AppForm from '../common/AppForm.vue'
import PathField from '../common/PathField.vue'
import flagGb from '../../assets/flags/gb.svg'
import flagVn from '../../assets/flags/vn.svg'
import flagJp from '../../assets/flags/jp.svg'

const flagMap: Record<string, string> = {
  gb: flagGb,
  vn: flagVn,
  jp: flagJp
}

const props = defineProps<{
  modelValueStable: string
  modelValueLazer: string
  osuLazerResolvedDataPath: string
  osuStablePlaceholder: string
  osuLazerPlaceholder: string
  showAutoDetectWarningInline: boolean
  isGeneralDefault: boolean
  isResetting: boolean
  currentLocale: string
  availableLocales: Array<{ value: string; text: string; flagCode: string }>
}>()

const emit = defineEmits<{
  (e: 'update:modelValueStable', val: string): void
  (e: 'update:modelValueLazer', val: string): void
  (e: 'update:currentLocale', val: string): void
  (e: 'select-stable-path'): void
  (e: 'select-lazer-path'): void
  (e: 'reset-general'): void
}>()

const osuStablePath = computed({
  get: () => props.modelValueStable,
  set: (val: string) => emit('update:modelValueStable', val)
})

const osuLazerPath = computed({
  get: () => props.modelValueLazer,
  set: (val: string) => emit('update:modelValueLazer', val)
})

const currentLocale = computed({
  get: () => props.currentLocale,
  set: (val: string) => emit('update:currentLocale', val)
})

const selectOsuStablePath = (): void => emit('select-stable-path')
const selectOsuLazerPath = (): void => emit('select-lazer-path')
const resetGeneralSettings = (): void => emit('reset-general')
</script>

<style scoped>
.flag-icon {
  display: inline-block;
  vertical-align: middle;
  border-radius: 2px;
  object-fit: cover;
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.4);
}
</style>
