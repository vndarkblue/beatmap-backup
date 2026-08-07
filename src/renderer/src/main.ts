import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import { THEME_PREF_KEY } from '../../config/frontendConstants'

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
  mdiFolderOpen
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
  folderOpen: mdiFolderOpen
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
          primary: '#ff66aa',
          secondary: '#5CBBF6'
        }
      },
      dark: {
        dark: true,
        colors: {
          primary: '#ff66aa',
          secondary: '#424242'
        }
      }
    }
  }
})

const app = createApp(App)
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
