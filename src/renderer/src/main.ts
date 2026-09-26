import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { FRONTEND_DEFAULTS, STORAGE_KEYS, THEME_PREF_KEY } from '../../config/frontendConstants'

try {
  const savedLocale = localStorage.getItem(STORAGE_KEYS.LOCALE) || FRONTEND_DEFAULTS.LOCALE
  document.documentElement.lang = savedLocale
} catch {
  // Ignore storage errors on startup
}

import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { aliases as mdiAliases, mdi } from 'vuetify/iconsets/mdi-svg'
import {
  mdiCog,
  mdiCogOutline,
  mdiExport,
  mdiDownload,
  mdiDownloadOutline,
  mdiWeatherNight,
  mdiWeatherSunny,
  mdiRestore,
  mdiTranslate,
  mdiHelpCircleOutline,
  mdiDatabaseOutline,
  mdiBackupRestore,
  mdiContentSaveOutline,
  mdiContentCopy,
  mdiPlay,
  mdiPause,
  mdiCheck,
  mdiClose,
  mdiStop,
  mdiCheckCircle,
  mdiChevronUp,
  mdiChevronDown,
  mdiRestoreAlert,
  mdiAlert,
  mdiClockOutline,
  mdiAlertCircle,
  mdiHelpCircle,
  mdiFileDocument,
  mdiFolder,
  mdiFileSearch,
  mdiFolderOpen,
  mdiUpdate,
  mdiRefresh,
  mdiDownloadBox,
  mdiMinus,
  mdiWindowMaximize,
  mdiWindowRestore,
  mdiSync,
  mdiInformationOutline,
  mdiEye,
  mdiEyeOff,
  mdiOpenInNew,
  mdiServer,
  mdiFilterVariant
} from '@mdi/js'

const getInitialTheme = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem(THEME_PREF_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const initialTheme = getInitialTheme()

const appIconAliases = {
  ...mdiAliases,
  cog: mdiCog,
  cogOutline: mdiCogOutline,
  export: mdiExport,
  download: mdiDownload,
  downloadOutline: mdiDownloadOutline,
  weatherNight: mdiWeatherNight,
  weatherSunny: mdiWeatherSunny,
  restore: mdiRestore,
  translate: mdiTranslate,
  helpCircleOutline: mdiHelpCircleOutline,
  databaseOutline: mdiDatabaseOutline,
  backupRestore: mdiBackupRestore,
  contentSaveOutline: mdiContentSaveOutline,
  contentCopy: mdiContentCopy,
  play: mdiPlay,
  pause: mdiPause,
  check: mdiCheck,
  close: mdiClose,
  stop: mdiStop,
  checkCircle: mdiCheckCircle,
  chevronUp: mdiChevronUp,
  chevronDown: mdiChevronDown,
  restoreAlert: mdiRestoreAlert,
  alert: mdiAlert,
  clockOutline: mdiClockOutline,
  alertCircle: mdiAlertCircle,
  helpCircle: mdiHelpCircle,
  fileDocument: mdiFileDocument,
  folder: mdiFolder,
  fileSearch: mdiFileSearch,
  folderOpen: mdiFolderOpen,
  update: mdiUpdate,
  refresh: mdiRefresh,
  downloadBox: mdiDownloadBox,
  windowMinimize: mdiMinus,
  windowMaximize: mdiWindowMaximize,
  windowRestore: mdiWindowRestore,
  sync: mdiSync,
  informationOutline: mdiInformationOutline,
  eye: mdiEye,
  eyeOff: mdiEyeOff,
  openInNew: mdiOpenInNew,
  server: mdiServer,
  filterVariant: mdiFilterVariant
}

const vuetify = createVuetify({
  icons: {
    defaultSet: 'mdi',
    aliases: appIconAliases,
    sets: { mdi }
  },
  theme: {
    defaultTheme: initialTheme,
    themes: {
      light: {
        dark: false,
        colors: {
          primary: '#db2777',
          secondary: '#0284c7',
          background: '#f8fafc',
          surface: '#ffffff'
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: '#ff66aa',
          secondary: '#38bdf8',
          background: '#121316',
          surface: '#1a1c24'
        }
      }
    }
  }
})

const app = createApp(App)

app.config.errorHandler = (err, _instance, info) => {
  const errorObj = err instanceof Error ? err : new Error(String(err))
  console.error('[VueError]', errorObj)
  window.electronAPI?.system?.reportRendererError?.({
    message: errorObj.message,
    stack: errorObj.stack,
    component: typeof info === 'string' ? info : undefined
  })
}

window.addEventListener('error', (event) => {
  window.electronAPI?.system?.reportRendererError?.({
    message: event.message || 'Unknown window error',
    stack: event.error instanceof Error ? event.error.stack : undefined
  })
})

app.use(vuetify)
app.use(router)
app.use(i18n)
app.mount('#app')

// Keep the boot-shell spinner up until the initial route component finishes
// loading. Without this, the spinner disappears before Settings.vue (lazy)
// has rendered, causing a flash of empty content.
void router.isReady().then(() => {
  requestAnimationFrame(() => {
    const bootShell = document.getElementById('boot-shell')
    bootShell?.remove()
    document.documentElement.classList.remove('booting')
  })
})
