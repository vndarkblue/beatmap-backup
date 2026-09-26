<template>
  <v-navigation-drawer
    v-model="drawer"
    :rail="rail"
    width="230"
    permanent
    absolute
    class="app-sidebar"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Navigation Items -->
    <v-list density="compact" nav class="sidebar-nav-list">
      <v-list-item
        v-for="item in navItems"
        :key="item.to"
        :value="item.to"
        :title="rail ? '' : $t(item.title)"
        :prepend-icon="item.icon"
        :active="router.currentRoute.value.path === item.to"
        :lang="currentLocale"
        class="sidebar-nav-item"
        @click="handleNavigate(item.to)"
      />
    </v-list>

    <!-- Bottom Actions: Theme Toggle -->
    <template #append>
      <v-divider class="sidebar-divider"></v-divider>
      <v-list density="compact" nav class="sidebar-append-list">
        <v-list-item
          class="sidebar-action-item sidebar-theme-item"
          :prepend-icon="themeIcon"
          :title="rail ? '' : themeLabel"
          :lang="currentLocale"
          @click="handleThemeClick"
        />
      </v-list>
    </template>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { routes } from '../../router'

const props = withDefaults(
  defineProps<{
    themeIcon?: string
    themeLabel?: string
    isThemeTransitioning?: boolean
  }>(),
  {
    themeIcon: '$weatherNight',
    themeLabel: '',
    isThemeTransitioning: false
  }
)

const emit = defineEmits<{
  (e: 'toggle-theme'): void
}>()

const router = useRouter()
const { locale } = useI18n()
const drawer = ref(true)
const rail = ref(true)

let lastMouseX = -1
let lastMouseY = -1

const updateMousePos = (e: MouseEvent): void => {
  lastMouseX = e.clientX
  lastMouseY = e.clientY
}

const isMouseInSidebar = (): boolean => {
  if (lastMouseX < 0 || lastMouseY < 0) return false
  return (
    lastMouseX >= 0 && lastMouseX <= 230 && lastMouseY >= 38 && lastMouseY <= window.innerHeight
  )
}

const currentLocale = computed(() => locale.value)
const navItems = computed(() => routes)

const handleMouseEnter = (e?: Event): void => {
  if (e && 'clientX' in e && typeof e.clientX === 'number') {
    updateMousePos(e as MouseEvent)
  }
  rail.value = false
}

const handleMouseLeave = (e?: Event): void => {
  if (e && 'clientX' in e && typeof e.clientX === 'number') {
    updateMousePos(e as MouseEvent)
  }
  if (props.isThemeTransitioning) return
  rail.value = true
}

const handleThemeClick = (e?: Event): void => {
  if (e && 'clientX' in e && typeof e.clientX === 'number') {
    updateMousePos(e as MouseEvent)
  }
  emit('toggle-theme')
}

watch(
  () => props.isThemeTransitioning,
  (transitioning) => {
    if (!transitioning) {
      if (!isMouseInSidebar()) {
        rail.value = true
      }
    }
  }
)

onMounted(() => {
  window.addEventListener('mousemove', updateMousePos, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', updateMousePos)
})

const handleNavigate = (path: string): void => {
  if (router.currentRoute.value.path !== path) {
    void router.push(path)
  }
}
</script>

<style scoped>
.app-sidebar {
  background-color: var(--sidebar-bg-color) !important;
  border-right: 1px solid var(--card-border-color) !important;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1) !important;
  will-change: width;
  height: 100% !important;
  max-height: 100% !important;
  top: 0 !important;
  bottom: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}

.app-sidebar :deep(.v-navigation-drawer__content) {
  flex: 1 1 auto !important;
  height: auto !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
}

.app-sidebar :deep(.v-navigation-drawer__append) {
  flex: 0 0 auto !important;
  margin-top: auto !important;
  padding-bottom: 10px !important;
}

.sidebar-divider {
  border-color: var(--card-border-color) !important;
  opacity: 0.6;
}

.sidebar-nav-list {
  padding: 10px 8px;
}

.sidebar-append-list {
  padding: 6px 8px 0 8px !important;
}

.sidebar-nav-item,
.sidebar-action-item {
  border-radius: 10px !important;
  margin-bottom: 4px !important;
  transition: all 0.2s ease !important;
  color: var(--text-muted-color) !important;
}

.sidebar-nav-item :deep(.v-list-item__content),
.sidebar-theme-item :deep(.v-list-item__content) {
  overflow: visible !important;
}

.sidebar-nav-item :deep(.v-list-item-title) {
  font-size: 1rem !important;
  font-weight: 700 !important;
  letter-spacing: 0.15px;
  line-height: 1.4 !important;
  padding: 2px 0 !important;
  overflow: visible !important;
}

.sidebar-action-item.sidebar-theme-item {
  margin-bottom: 0 !important;
}

.sidebar-theme-item :deep(.v-list-item-title) {
  font-size: 1rem !important;
  font-weight: 500 !important;
  letter-spacing: 0.15px;
  line-height: 1.4 !important;
  padding: 2px 0 !important;
  overflow: visible !important;
}

.sidebar-nav-item:hover,
.sidebar-action-item:hover {
  background-color: rgba(255, 102, 170, 0.12) !important;
  color: var(--accent-pink) !important;
}

.v-list-item--active {
  background-color: rgba(255, 102, 170, 0.16) !important;
  color: var(--accent-pink) !important;
  font-weight: 700 !important;
}
</style>
