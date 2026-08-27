<template>
  <v-app :theme="theme.global.name.value" :lang="currentLocale">
    <v-navigation-drawer
      v-model="drawer"
      :rail="rail"
      permanent
      @mouseenter="rail = false"
      @mouseleave="rail = true"
    >
      <v-list-item
        class="sidebar-logo-item"
        :prepend-avatar="logoUrl"
        :title="rail ? '' : 'Beatmap Backup'"
      >
      </v-list-item>

      <v-divider></v-divider>

      <v-list density="compact" nav>
        <v-list-item
          v-for="item in items"
          :key="item.title"
          :value="item.title"
          :title="rail ? '' : item.title"
          :prepend-icon="item.icon"
          :active="router.currentRoute.value.path === item.to"
          :lang="currentLocale"
          @click="handleNavigation(item.to)"
        ></v-list-item>
      </v-list>

      <template #append>
        <v-list density="compact" nav>
          <v-list-item
            class="sidebar-theme-item"
            :prepend-icon="themeIcon"
            :title="rail ? '' : themeLabel"
            :lang="currentLocale"
            @click="toggleTheme"
          />
        </v-list>
      </template>
    </v-navigation-drawer>

    <v-main class="main-bg">
      <SimpleBar ref="scrollHostRef" class="simplebar-container">
        <v-container fluid class="container-bg">
          <router-view></router-view>
        </v-container>
      </SimpleBar>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useRouter, type NavigationFailure } from 'vue-router'
import { routes } from './router'
import { STORAGE_KEYS, THEME_PREF_KEY } from '../../config/frontendConstants'
import logoUrl from './assets/logo.png'
import SimpleBar from 'simplebar-vue'
import 'simplebar-vue/dist/simplebar.min.css'

const theme = useTheme()
const { t, locale } = useI18n()
const router = useRouter()
const drawer = ref(true)
const rail = ref(true)
const scrollHostRef = ref<InstanceType<typeof SimpleBar> | null>(null)
const routeScrollPositions = new Map<string, number>()
let removeBeforeEachGuard: (() => void) | null = null
let removeAfterEachHook: (() => void) | null = null

const currentLocale = computed(() => locale.value)
const themeIcon = computed(() =>
  theme.global.name.value === 'light' ? '$weatherNight' : '$weatherSunny'
)
const themeLabel = computed(() =>
  theme.global.name.value === 'light' ? t('theme.dark') : t('theme.light')
)
const items = computed(() =>
  routes.map((route) => ({
    ...route,
    title: t(route.title)
  }))
)

const handleNavigation = (to: string): Promise<void | NavigationFailure | undefined> => {
  return router.push(to)
}

const syncThemeFromLocalPreference = (): void => {
  const nextTheme = localStorage.getItem(THEME_PREF_KEY) === 'dark' ? 'dark' : 'light'
  theme.global.name.value = nextTheme
  document.documentElement.classList.toggle('theme-dark', nextTheme === 'dark')
}

const validateOsuPaths = async (): Promise<void> => {
  try {
    // Check osu!stable path
    const stableData = await window.electronAPI.settings.validatePath('stable')
    if (!stableData.valid) {
      console.warn('Invalid osu!stable path:', stableData.error)
    }

    // Check osu!lazer path
    const lazerData = await window.electronAPI.settings.validatePath('lazer')
    if (!lazerData.valid) {
      console.warn('Invalid osu!lazer path:', lazerData.error)
    }
  } catch (error) {
    console.error('Failed to validate osu! paths:', error)
  }
}

const prefetchSecondaryViews = (): void => {
  // Warm secondary route chunks after first paint to keep initial tab responsive.
  setTimeout(() => {
    void import('./components/Backup.vue')
    void import('./components/Download.vue')
  }, 0)
}

type BackupToggleState = {
  stableBackup: boolean
  lazerBackup: boolean
  backupOnlineIds: boolean
  backupLocalBeatmaps: boolean
  backupByCollection: boolean
  mergeCollectionNames: boolean
}

const prewarmBackupCollectionPreview = (): void => {
  // Warm preview data in background so first Backup tab open feels instant.
  setTimeout(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.BACKUP_TOGGLE_STATE)
      if (!raw) return
      const state = JSON.parse(raw) as Partial<BackupToggleState>
      const stable = Boolean(state.stableBackup)
      const lazer = Boolean(state.lazerBackup)
      const backupOnlineIds = state.backupOnlineIds !== false
      const backupByCollection = Boolean(state.backupByCollection)
      if (!backupOnlineIds || !backupByCollection || (!stable && !lazer)) return
      const mergeMode: 'merge' | 'split' = state.mergeCollectionNames === false ? 'split' : 'merge'
      void window.electronAPI.backup.previewCollections({ stable, lazer, mergeMode })
    } catch {
      // Ignore invalid persisted state.
    }
  }, 1_000)
}

const getRouteScrollElement = (): HTMLElement | null => {
  const rootEl = scrollHostRef.value?.$el as HTMLElement | undefined
  if (!rootEl) return null
  return rootEl.querySelector('.simplebar-content-wrapper')
}

const saveRouteScrollPosition = (path: string): void => {
  const scrollEl = getRouteScrollElement()
  if (!scrollEl) return
  routeScrollPositions.set(path, scrollEl.scrollTop)
}

const restoreRouteScrollPosition = (path: string): void => {
  const scrollEl = getRouteScrollElement()
  if (!scrollEl) return
  const nextScrollTop = routeScrollPositions.get(path) ?? 0
  scrollEl.scrollTop = nextScrollTop
}

const setupRouteScrollMemory = (): void => {
  removeBeforeEachGuard = router.beforeEach((_to, from, next) => {
    saveRouteScrollPosition(from.fullPath)
    next()
  })

  removeAfterEachHook = router.afterEach((to) => {
    setTimeout(() => {
      restoreRouteScrollPosition(to.fullPath)
    }, 0)
  })

  // Ensure current route also starts from remembered position.
  setTimeout(() => {
    restoreRouteScrollPosition(router.currentRoute.value.fullPath)
  }, 0)
}

const saveDarkMode = (isDark: boolean): void => {
  const nextTheme = isDark ? 'dark' : 'light'
  localStorage.setItem(THEME_PREF_KEY, nextTheme)
  document.documentElement.classList.toggle('theme-dark', isDark)
}

const toggleTheme = (): void => {
  const isDark = !theme.global.current.value.dark
  theme.global.name.value = isDark ? 'dark' : 'light'
  saveDarkMode(isDark)
}

onMounted(() => {
  syncThemeFromLocalPreference()
  validateOsuPaths()
  prefetchSecondaryViews()
  prewarmBackupCollectionPreview()
  setupRouteScrollMemory()
})

onBeforeUnmount(() => {
  saveRouteScrollPosition(router.currentRoute.value.fullPath)
  removeBeforeEachGuard?.()
  removeAfterEachHook?.()
  removeBeforeEachGuard = null
  removeAfterEachHook = null
})
</script>

<style>
.v-navigation-drawer {
  transition: width 0.2s ease-in-out !important;
  background: var(--v-theme-background) !important;
  font-family: var(--font-default) !important;
  font-weight: 900 !important;
}

.v-navigation-drawer[lang='vi'] {
  font-family: var(--font-default-vi) !important;
}

.v-navigation-drawer:not(.v-navigation-drawer--rail) {
  width: 220px !important;
}

/* Handle main content layout when sidebar is expanded */
.v-navigation-drawer:not(.v-navigation-drawer--rail) ~ .v-main {
  --v-layout-left: 220px !important;
}

.main-bg {
  background: var(--v-theme-background) !important;
}

.container-bg {
  background: var(--v-theme-background) !important;
  min-height: 100vh;
}

.sidebar-logo-item {
  min-height: 60px;
  height: 60px;
  display: flex;
  align-items: center;
}

.sidebar-logo-item .v-list-item-title {
  font-family: 'Torus Notched', Inter, system-ui, Avenir, Helvetica, Arial, sans-serif !important;
  font-weight: 600 !important;
  font-size: 1.1rem !important;
}

.v-list-item-title {
  font-family: var(--font-default) !important;
  font-weight: 600 !important;
  font-size: 1rem !important;
  white-space: normal !important;
  line-height: 1.2 !important;
  height: 40px !important;
  overflow: hidden !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  display: flex !important;
  align-items: center !important;
  -webkit-box-align: center !important;
}

.v-list-item-title[lang='vi'] {
  font-family: var(--font-default-vi) !important;
}

.v-list-item {
  font-family: var(--font-default) !important;
  min-height: 56px !important;
  height: 56px !important;
  display: flex !important;
  align-items: center !important;
}

.v-list-item[lang='vi'] {
  font-family: var(--font-default-vi) !important;
}

.v-navigation-drawer .sidebar-theme-item .v-list-item__prepend .v-icon {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  opacity: 1 !important;
}

.v-navigation-drawer .sidebar-theme-item:hover .v-list-item__prepend .v-icon {
  color: inherit;
}

.v-navigation-drawer .v-list .v-list-item .v-list-item-title {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.v-navigation-drawer.v-navigation-drawer--rail .v-list .v-list-item .v-list-item-title {
  opacity: 0 !important;
  transform: translateX(-12px) !important;
}

.v-navigation-drawer:not(.v-navigation-drawer--rail) .v-list .v-list-item .v-list-item-title {
  opacity: 0;
  transform: translateX(-12px);
  animation: navTitleSlideIn 180ms ease-out 40ms forwards;
}

.v-btn .v-btn__content {
  font-family: var(--font-default) !important;
}

.v-btn[lang='vi'] .v-btn__content {
  font-family: var(--font-default-vi) !important;
}

/* SimpleBar custom styles */
.simplebar-container {
  height: 100vh;
}

.simplebar-scrollbar::before {
  background-color: #888;
  opacity: 0;
  transition: opacity 0.2s linear;
}

.simplebar-scrollbar.simplebar-visible::before {
  opacity: 1;
}

.simplebar-track.simplebar-vertical {
  width: 6px;
  right: 0;
  background: transparent;
}

.simplebar-track.simplebar-horizontal {
  height: 6px;
  bottom: 0;
  background: transparent;
}

/* Hide scrollbar when not hovering */
.simplebar-container:hover .simplebar-scrollbar::before {
  opacity: 0.5;
}

.simplebar-container:hover .simplebar-scrollbar.simplebar-visible::before {
  opacity: 1;
}

@keyframes navTitleSlideIn {
  from {
    opacity: 0;
    transform: translateX(-12px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
