export const STORAGE_KEYS = {
  THEME_PREFERENCE: 'theme.preference.v1',
  LOCALE: 'locale',
  DOWNLOAD_SETTINGS: 'downloadSettings',
  BACKUP_TOGGLE_STATE: 'backup.toggle.state.v1',
  BACKUP_COLLECTION_PREVIEW_SNAPSHOT: 'backup.collection.preview.snapshot.v1'
} as const

export const THEME_PREF_KEY = STORAGE_KEYS.THEME_PREFERENCE

export const FRONTEND_DEFAULTS = {
  LOCALE: 'en',
  THREAD_COUNT: 5
} as const

export const HTTP_HEADERS = {
  JSON: { 'Content-Type': 'application/json' }
} as const

export const FRONTEND_TIMINGS_MS = {
  DOWNLOAD_COMPLETED_TOAST: 8000,
  DOWNLOAD_SSE_RECONNECT: 5000,
  AUTO_DETECT_WARNING_HIDE: 4500
} as const
