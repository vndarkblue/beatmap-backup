import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import vi from './locales/vi.json'
import ja from './locales/ja.json'
import { FRONTEND_DEFAULTS, STORAGE_KEYS } from '../../../config/frontendConstants'

const i18n = createI18n({
  legacy: false, // Set to false to use Composition API
  locale: localStorage.getItem(STORAGE_KEYS.LOCALE) || FRONTEND_DEFAULTS.LOCALE, // Default language
  fallbackLocale: FRONTEND_DEFAULTS.LOCALE, // Fallback language
  messages: {
    en,
    vi,
    ja
  }
})

export default i18n
