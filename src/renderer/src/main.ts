import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'

const THEME_PREF_KEY = 'theme.preference.v1'

const getInitialTheme = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem(THEME_PREF_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const initialTheme = getInitialTheme()

const vuetify = createVuetify({
  components,
  directives,
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

const bootShell = document.getElementById('boot-shell')
if (bootShell) {
  requestAnimationFrame(() => {
    bootShell.remove()
    document.documentElement.classList.remove('booting')
  })
} else {
  document.documentElement.classList.remove('booting')
}
