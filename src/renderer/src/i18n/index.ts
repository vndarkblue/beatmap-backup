import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import vi from './locales/vi.json'

const i18n = createI18n({
  legacy: false, // Set to false to use Composition API
  locale: localStorage.getItem('locale') || 'en', // Default language
  fallbackLocale: 'en', // Fallback language
  messages: {
    en,
    vi
  }
})

export default i18n 