export const APP_NAME = 'Beatmap Backup'
export const APP_ID = 'com.vndarkblue.beatmap-backup'
export const API_BASE_URL = 'http://localhost:3000/api'

// API Endpoints
export const API_ENDPOINTS = {
  SETTINGS: `${API_BASE_URL}/settings`,
  SETTINGS_OSU_STABLE: `${API_BASE_URL}/settings/osu-stable`,
  SETTINGS_OSU_LAZER: `${API_BASE_URL}/settings/osu-lazer`,
  SETTINGS_DARK_MODE: `${API_BASE_URL}/settings/dark-mode`,
  SETTINGS_VALIDATE_OSU_STABLE: `${API_BASE_URL}/settings/validate/osu-stable`,
  SETTINGS_VALIDATE_OSU_LAZER: `${API_BASE_URL}/settings/validate/osu-lazer`,
  MIRRORS_STATUS: `${API_BASE_URL}/mirrors/status`,
  DOWNLOAD: `${API_BASE_URL}/download`,
  DOWNLOAD_PAUSE: `${API_BASE_URL}/download/pause`,
  DOWNLOAD_RESUME: `${API_BASE_URL}/download/resume`,
  DOWNLOAD_STOP: `${API_BASE_URL}/download/stop`,
  DOWNLOAD_VALIDATE: `${API_BASE_URL}/download/validate`,
  DOWNLOAD_EVENTS: `${API_BASE_URL}/download/events`
} as const

// Window settings
export const WINDOW_CONFIG = {
  DEFAULT_WIDTH: 900,
  DEFAULT_HEIGHT: 670,
  MIN_WIDTH: 700,
  MIN_HEIGHT: 300
}
