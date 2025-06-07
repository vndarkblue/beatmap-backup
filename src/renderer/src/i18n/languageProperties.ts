export const languageNames = {
  en: 'English',
  vi: 'Tiếng Việt',
  // Add new languages here
} as const

export const languageFlags = {
  en: 'gb',
  vi: 'vn',
  // Add new language flags here
} as const

export type LanguageCode = keyof typeof languageNames 