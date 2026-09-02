import Store from 'electron-store'

export interface Settings {
  osuStablePath: string
  osuStableSongsPath: string
  osuLazerPath: string
  osuLazerResolvedDataPath: string
  autoDetectWarningDismissed: boolean
  downloadThreadCount: number
  selectedMirrors: string[]
  waitForDownloadsOnPause: boolean
  downloadPath: string
  queueAutoResume: boolean
  queueCheckpointIntervalMs: number
  maxCheckpointFileSizeMB: number
}

const defaultSettings: Settings = {
  osuStablePath: '',
  osuStableSongsPath: '',
  osuLazerPath: '',
  osuLazerResolvedDataPath: '',
  autoDetectWarningDismissed: false,
  downloadThreadCount: 5,
  selectedMirrors: [],
  waitForDownloadsOnPause: true,
  downloadPath: '',
  queueAutoResume: true,
  queueCheckpointIntervalMs: 1500,
  maxCheckpointFileSizeMB: 20
}

// @ts-ignore - Store type definition is incomplete in electron-store package
const settingsStore = new Store<Settings>({
  name: 'settings',
  defaults: defaultSettings
})

export const getSettings = (): Settings => {
  return {
    osuStablePath: settingsStore.get('osuStablePath', ''),
    osuStableSongsPath: settingsStore.get('osuStableSongsPath', ''),
    osuLazerPath: settingsStore.get('osuLazerPath', ''),
    osuLazerResolvedDataPath: settingsStore.get('osuLazerResolvedDataPath', ''),
    autoDetectWarningDismissed: settingsStore.get('autoDetectWarningDismissed', false),
    downloadThreadCount: settingsStore.get('downloadThreadCount', 5),
    selectedMirrors: settingsStore.get('selectedMirrors', []),
    waitForDownloadsOnPause: settingsStore.get('waitForDownloadsOnPause', true),
    downloadPath: settingsStore.get('downloadPath', ''),
    queueAutoResume: settingsStore.get('queueAutoResume', true),
    queueCheckpointIntervalMs: settingsStore.get('queueCheckpointIntervalMs', 1500),
    maxCheckpointFileSizeMB: settingsStore.get('maxCheckpointFileSizeMB', 20)
  }
}

export const updateSettings = (patch: Partial<Settings>): void => {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      settingsStore.set(key, value)
    }
  }
}

export const setOsuStablePath = (path: string): void => {
  settingsStore.set('osuStablePath', path)
}

export const setOsuStableSongsPath = (path: string): void => {
  settingsStore.set('osuStableSongsPath', path)
}

export const setOsuLazerPath = (path: string): void => {
  settingsStore.set('osuLazerPath', path)
}

export const setOsuLazerResolvedDataPath = (path: string): void => {
  settingsStore.set('osuLazerResolvedDataPath', path)
}

export const getOsuStablePath = (): string => {
  return settingsStore.get('osuStablePath', '')
}

export const getOsuStableSongsPath = (): string => {
  return settingsStore.get('osuStableSongsPath', '')
}

export const getOsuLazerPath = (): string => {
  return settingsStore.get('osuLazerPath', '')
}

export const getOsuLazerResolvedDataPath = (): string => {
  return settingsStore.get('osuLazerResolvedDataPath', '')
}

export const getAutoDetectWarningDismissed = (): boolean => {
  return settingsStore.get('autoDetectWarningDismissed', false)
}

export const setAutoDetectWarningDismissed = (dismissed: boolean): void => {
  settingsStore.set('autoDetectWarningDismissed', dismissed)
}

export const getDownloadThreadCount = (): number => {
  return settingsStore.get('downloadThreadCount', 5)
}

export const setDownloadThreadCount = (count: number): void => {
  settingsStore.set('downloadThreadCount', count)
}

export const getSelectedMirrors = (): string[] => {
  return settingsStore.get('selectedMirrors', [])
}

export const setSelectedMirrors = (mirrors: string[]): void => {
  settingsStore.set('selectedMirrors', mirrors)
}

export const getWaitForDownloadsOnPause = (): boolean => {
  return settingsStore.get('waitForDownloadsOnPause', true)
}

export const setWaitForDownloadsOnPause = (wait: boolean): void => {
  settingsStore.set('waitForDownloadsOnPause', wait)
}

export const getDownloadPath = (): string => {
  return settingsStore.get('downloadPath', '')
}

export const setDownloadPath = (path: string): void => {
  settingsStore.set('downloadPath', path)
}

export const getQueueAutoResume = (): boolean => {
  return settingsStore.get('queueAutoResume', true)
}

export const getQueueCheckpointIntervalMs = (): number => {
  return settingsStore.get('queueCheckpointIntervalMs', 1500)
}

export const getMaxCheckpointFileSizeMB = (): number => {
  return settingsStore.get('maxCheckpointFileSizeMB', 20)
}

export const resetSettings = (): void => {
  settingsStore.clear()
}
