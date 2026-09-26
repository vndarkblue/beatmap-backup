<template>
  <v-app :theme="theme.global.name.value" :lang="currentLocale" class="app-root-shell">
    <AppTitlebar
      :has-update-available="hasUpdateAvailable"
      :update-status="updateStatus"
      :error-context="errorContext"
      :distribution-type="distributionType"
      :latest-version="latestVersion"
      :update-progress="updateProgress"
      @check-updates="() => checkForUpdates(true)"
      @do-update="doUpdate"
      @install-update="installUpdate"
    />

    <v-layout class="app-layout-body">
      <AppSidebar
        :theme-icon="themeIcon"
        :theme-label="themeLabel"
        :is-theme-transitioning="isThemeTransitioning"
        @toggle-theme="toggleTheme"
      />

      <v-main class="main-bg">
        <SimpleBar ref="scrollHostRef" class="simplebar-container">
          <v-container fluid class="container-bg">
            <router-view></router-view>
          </v-container>
        </SimpleBar>
      </v-main>
    </v-layout>

    <v-snackbar
      v-model="toastVisible"
      :color="toastColor"
      :timeout="toastTimeout"
      location="bottom end"
      elevation="6"
    >
      <div class="d-flex align-center justify-space-between w-100">
        <span class="mr-2">{{ toastMessage }}</span>
        <v-btn v-if="toastAction" variant="text" size="small" @click="toastAction.onClick">
          {{ toastAction.label }}
        </v-btn>
      </div>
    </v-snackbar>
  </v-app>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted, computed, watch, nextTick } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { THEME_PREF_KEY } from '../../config/frontendConstants'
import SimpleBar from 'simplebar-vue'
import 'simplebar-vue/dist/simplebar.min.css'
import AppTitlebar from './components/layout/AppTitlebar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import { useUpdater } from './composables/useUpdater'

const theme = useTheme()
const { t, locale } = useI18n()
const router = useRouter()
const scrollHostRef = ref<InstanceType<typeof SimpleBar> | null>(null)
const routeScrollPositions = new Map<string, number>()
let removeBeforeEachGuard: (() => void) | null = null
let removeAfterEachHook: (() => void) | null = null

const {
  hasUpdateAvailable,
  updateStatus,
  errorContext,
  latestVersion,
  updateProgress,
  distributionType,
  checkForUpdates,
  doUpdate,
  installUpdate,
  initialize: initializeUpdater,
  teardown: teardownUpdater
} = useUpdater()

const toastVisible = ref(false)
const toastMessage = ref('')
const toastColor = ref('info')
const toastTimeout = ref(4000)
const toastAction = ref<{ label: string; onClick: () => void } | null>(null)
let unsubscribeDatabaseSync: (() => void) | null = null

watch(
  () => locale.value,
  (newLocale) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale
    }
  },
  { immediate: true }
)

const showToast = (
  message: string,
  color = 'info',
  timeout = 4000,
  action?: { label: string; onClick: () => void }
): void => {
  toastMessage.value = message
  toastColor.value = color
  toastTimeout.value = timeout
  toastAction.value = action ?? null
  toastVisible.value = true
}

const setupGlobalDatabaseSyncListener = (): void => {
  if (unsubscribeDatabaseSync || !window.electronAPI?.database?.onSyncProgress) return
  unsubscribeDatabaseSync = window.electronAPI.database.onSyncProgress((progress) => {
    if (progress.phase === 'error') {
      showToast(
        t('notifications.syncError.message', {
          error: progress.error || t('settings.database.error')
        }),
        'error',
        6000,
        {
          label: t('notifications.syncError.viewSettings'),
          onClick: () => {
            toastVisible.value = false
            void router.push('/settings')
          }
        }
      )
    }
  })
}

const currentLocale = computed(() => locale.value)
const themeIcon = computed(() =>
  theme.global.name.value === 'light' ? '$weatherNight' : '$weatherSunny'
)
const themeLabel = computed(() =>
  theme.global.name.value === 'light' ? t('theme.dark') : t('theme.light')
)

const syncThemeFromLocalPreference = (): void => {
  const isDark = localStorage.getItem(THEME_PREF_KEY) === 'dark'
  const nextTheme = isDark ? 'dark' : 'light'
  theme.global.name.value = nextTheme
  document.documentElement.classList.toggle('theme-dark', isDark)
  document.documentElement.classList.toggle('theme-light', !isDark)
}

const validateOsuPaths = async (): Promise<void> => {
  try {
    const stableData = await window.electronAPI.settings.validatePath('stable')
    if (!stableData.valid) {
      console.warn('Invalid osu!stable path:', stableData.error)
    }
    const lazerData = await window.electronAPI.settings.validatePath('lazer')
    if (!lazerData.valid) {
      console.warn('Invalid osu!lazer path:', lazerData.error)
    }
  } catch (error) {
    console.error('Failed to validate osu! paths:', error)
  }
}

const runIdleTask = (task: () => void): void => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 3000 })
  } else {
    setTimeout(task, 1500)
  }
}

const prefetchSecondaryViews = (): void => {
  runIdleTask(() => {
    void import('./components/Backup.vue')
    void import('./components/Download.vue')
  })
}

const getScrollElement = (): HTMLElement | null => {
  const simpleBarInstance = scrollHostRef.value as {
    getScrollElement?: () => HTMLElement | null
    scrollElement?: HTMLElement | null
    $el?: HTMLElement
  } | null

  if (!simpleBarInstance) return null
  if (typeof simpleBarInstance.getScrollElement === 'function') {
    return simpleBarInstance.getScrollElement()
  }
  if (simpleBarInstance.scrollElement instanceof HTMLElement) {
    return simpleBarInstance.scrollElement
  }
  return simpleBarInstance.$el?.querySelector('.simplebar-content-wrapper') ?? null
}

const saveRouteScrollPosition = (path: string): void => {
  const scrollElement = getScrollElement()
  if (!scrollElement) return
  routeScrollPositions.set(path, scrollElement.scrollTop)
}

const restoreRouteScrollPosition = (path: string): void => {
  const targetTop = routeScrollPositions.get(path) ?? 0
  const scrollElement = getScrollElement()
  if (!scrollElement) return
  scrollElement.scrollTop = targetTop
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

  setTimeout(() => {
    restoreRouteScrollPosition(router.currentRoute.value.fullPath)
  }, 0)
}

const isThemeTransitioning = ref(false)

const saveDarkMode = (isDark: boolean): void => {
  const nextTheme = isDark ? 'dark' : 'light'
  localStorage.setItem(THEME_PREF_KEY, nextTheme)
  document.documentElement.classList.toggle('theme-dark', isDark)
  document.documentElement.classList.toggle('theme-light', !isDark)
}

const toggleTheme = async (): Promise<void> => {
  if (isThemeTransitioning.value) return
  const isDark = !theme.global.current.value.dark

  const applyTheme = (): void => {
    theme.global.name.value = isDark ? 'dark' : 'light'
    saveDarkMode(isDark)
  }

  const doc = typeof document !== 'undefined' ? document : null
  const supportsViewTransition = Boolean(
    doc &&
      typeof doc.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  isThemeTransitioning.value = true
  // Immediately suppress individual CSS transitions across all elements
  // to prevent staggered/cascading color shifts
  document.documentElement.classList.add('disable-theme-transitions')

  if (!supportsViewTransition) {
    applyTheme()
    void document.documentElement.offsetHeight
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('disable-theme-transitions')
        isThemeTransitioning.value = false
      })
    })
    return
  }

  try {
    const transition = doc!.startViewTransition(async () => {
      applyTheme()
      await nextTick()
    })

    await transition.ready

    const endRadius = Math.hypot(window.innerWidth, window.innerHeight)

    const animation = document.documentElement.animate(
      {
        clipPath: ['circle(0px at 0% 100%)', `circle(${endRadius}px at 0% 100%)`]
      },
      {
        duration: 380,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)'
      }
    )

    await animation.finished
  } catch (error) {
    console.debug('Theme view transition interrupted:', error)
  } finally {
    document.documentElement.classList.remove('disable-theme-transitions')
    isThemeTransitioning.value = false
  }
}

onMounted(() => {
  syncThemeFromLocalPreference()
  setupRouteScrollMemory()
  setupGlobalDatabaseSyncListener()
  void initializeUpdater()

  runIdleTask(() => {
    void validateOsuPaths()
    prefetchSecondaryViews()
  })
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('disable-theme-transitions')
  saveRouteScrollPosition(router.currentRoute.value.fullPath)
  removeBeforeEachGuard?.()
  removeAfterEachHook?.()
  removeBeforeEachGuard = null
  removeAfterEachHook = null
  unsubscribeDatabaseSync?.()
  unsubscribeDatabaseSync = null
  teardownUpdater()
})
</script>

<style>
.app-root-shell {
  display: flex !important;
  flex-direction: column !important;
  height: 100vh !important;
  max-height: 100vh !important;
  overflow: hidden !important;
  background-color: var(--main-bg-color) !important;
}

.app-root-shell > .v-application__wrap {
  height: 100vh !important;
  max-height: 100vh !important;
  min-height: 100vh !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
}

.app-layout-body {
  flex: 1 1 auto !important;
  height: calc(100vh - 38px) !important;
  max-height: calc(100vh - 38px) !important;
  min-height: 0 !important;
  overflow: hidden !important;
  position: relative !important;
}

.main-bg {
  background: var(--main-bg-color) !important;
  height: 100% !important;
}

.simplebar-container {
  height: 100% !important;
  width: 100% !important;
}

.container-bg {
  background: transparent !important;
  min-height: 100%;
  padding-bottom: 0 !important;
}
</style>
