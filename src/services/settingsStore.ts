import { safeStorage } from 'electron'
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
  queueCheckpointIntervalMs: number
  maxCheckpointFileSizeMB: number
  beatconnectApiTokenEncrypted: string
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
  queueCheckpointIntervalMs: 1500,
  maxCheckpointFileSizeMB: 20,
  beatconnectApiTokenEncrypted: ''
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
    queueCheckpointIntervalMs: settingsStore.get('queueCheckpointIntervalMs', 1500),
    maxCheckpointFileSizeMB: settingsStore.get('maxCheckpointFileSizeMB', 20),
    beatconnectApiTokenEncrypted: settingsStore.get('beatconnectApiTokenEncrypted', '')
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

export const getWaitForDownloadsOnPause = (): boolean => {
  return settingsStore.get('waitForDownloadsOnPause', true)
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

export const getBeatconnectApiToken = (): string => {
  const encrypted = settingsStore.get('beatconnectApiTokenEncrypted', '')
  if (!encrypted) return ''
  if (
    typeof safeStorage?.isEncryptionAvailable !== 'function' ||
    !safeStorage.isEncryptionAvailable()
  ) {
    return encrypted
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    settingsStore.set('beatconnectApiTokenEncrypted', '')
    return ''
  }
}

export const setBeatconnectApiToken = (token: string): void => {
  if (!token) {
    settingsStore.set('beatconnectApiTokenEncrypted', '')
    return
  }
  if (
    typeof safeStorage?.isEncryptionAvailable === 'function' &&
    safeStorage.isEncryptionAvailable()
  ) {
    const encrypted = safeStorage.encryptString(token)
    settingsStore.set('beatconnectApiTokenEncrypted', encrypted.toString('base64'))
  } else {
    settingsStore.set('beatconnectApiTokenEncrypted', token)
  }
}

export const hasBeatconnectApiToken = (): boolean => {
  return !!settingsStore.get('beatconnectApiTokenEncrypted', '')
}
