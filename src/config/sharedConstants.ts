export const APP_NAME = 'Beatmap Backup'
export const APP_ID = 'com.vndarkblue.beatmap-backup'

export const API_PORT = 3727
export const API_BASE_PATH = '/api'
export const API_BASE_URL = `http://localhost:${API_PORT}${API_BASE_PATH}`

export const API_ROUTE_PATHS = {
  SETTINGS: `${API_BASE_PATH}/settings`,
  SETTINGS_RESET: `${API_BASE_PATH}/settings/reset`,
  SETTINGS_OSU_STABLE: `${API_BASE_PATH}/settings/osu-stable`,
  SETTINGS_OSU_LAZER: `${API_BASE_PATH}/settings/osu-lazer`,
  SETTINGS_AUTO_DETECT_STATUS: `${API_BASE_PATH}/settings/auto-detect-status`,
  SETTINGS_WAIT_FOR_DOWNLOADS: `${API_BASE_PATH}/settings/wait-for-downloads`,
  SETTINGS_DOWNLOAD_PATH: `${API_BASE_PATH}/settings/download-path`,
  SETTINGS_VALIDATE_DOWNLOAD_PATH: `${API_BASE_PATH}/settings/validate/download-path`,
  SETTINGS_VALIDATE_OSU_STABLE: `${API_BASE_PATH}/settings/validate/osu-stable`,
  SETTINGS_VALIDATE_OSU_LAZER: `${API_BASE_PATH}/settings/validate/osu-lazer`,
  MIRRORS_STATUS: `${API_BASE_PATH}/mirrors/status`,
  DOWNLOAD: `${API_BASE_PATH}/download`,
  DOWNLOAD_PAUSE: `${API_BASE_PATH}/download/pause`,
  DOWNLOAD_RESUME: `${API_BASE_PATH}/download/resume`,
  DOWNLOAD_STOP: `${API_BASE_PATH}/download/stop`,
  DOWNLOAD_EVENTS: `${API_BASE_PATH}/download/events`,
  DOWNLOAD_STATUS: `${API_BASE_PATH}/download/status`,
  DOWNLOAD_RECOVERY: `${API_BASE_PATH}/download/recovery`,
  DOWNLOAD_RECOVERY_RESUME: `${API_BASE_PATH}/download/recovery/resume`,
  DOWNLOAD_RECOVERY_DISCARD: `${API_BASE_PATH}/download/recovery/discard`,
  EXPORT_ESTIMATE: `${API_BASE_PATH}/export/estimate`,
  DATABASE_STATUS: `${API_BASE_PATH}/database/status`,
  DATABASE_SYNC: `${API_BASE_PATH}/database/sync`,
  DATABASE_SYNC_EVENTS: `${API_BASE_PATH}/database/sync/events`,
  DATABASE_FILTER_BEATMAPS: `${API_BASE_PATH}/database/beatmaps/filter`
} as const

export const buildApiEndpoints = (
  baseUrl: string = API_BASE_URL
): Record<keyof typeof API_ROUTE_PATHS, string> =>
  Object.fromEntries(
    Object.entries(API_ROUTE_PATHS).map(([key, route]) => [
      key,
      `${baseUrl}${route.replace(API_BASE_PATH, '')}`
    ])
  ) as Record<keyof typeof API_ROUTE_PATHS, string>

export const API_ENDPOINTS = buildApiEndpoints()
