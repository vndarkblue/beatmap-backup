export const languageNames = {
  en: 'English',
  vi: 'Tiếng Việt',
  ja: '日本語'
  // Add new languages here
} as const

export const languageFlags = {
  en: 'gb',
  vi: 'vn',
  ja: 'jp'
  // Add new language flags here
} as const

export type LanguageCode = keyof typeof languageNames
