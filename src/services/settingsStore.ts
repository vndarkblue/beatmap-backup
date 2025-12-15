import Store from 'electron-store'

interface Settings {
  osuStablePath: string
  osuLazerPath: string
  isDarkMode: boolean
  downloadThreadCount: number
  selectedMirrors: string[]
  waitForDownloadsOnPause: boolean
}

const defaultSettings: Settings = {
  osuStablePath: '',
  osuLazerPath: '',
  isDarkMode: false,
  downloadThreadCount: 5,
  selectedMirrors: [],
  waitForDownloadsOnPause: true
}

// @ts-ignore - Store type definition is incomplete in electron-store package
const settingsStore = new Store<Settings>({
  name: 'settings',
  defaults: defaultSettings
})

export const getSettings = (): Settings => {
  return {
    osuStablePath: settingsStore.get('osuStablePath', ''),
    osuLazerPath: settingsStore.get('osuLazerPath', ''),
    isDarkMode: settingsStore.get('isDarkMode', false),
    downloadThreadCount: settingsStore.get('downloadThreadCount', 5),
    selectedMirrors: settingsStore.get('selectedMirrors', []),
    waitForDownloadsOnPause: settingsStore.get('waitForDownloadsOnPause', true)
  }
}

export const setOsuStablePath = (path: string): void => {
  settingsStore.set('osuStablePath', path)
}

export const setOsuLazerPath = (path: string): void => {
  settingsStore.set('osuLazerPath', path)
}

export const getOsuStablePath = (): string => {
  return settingsStore.get('osuStablePath', '')
}

export const getOsuLazerPath = (): string => {
  return settingsStore.get('osuLazerPath', '')
}

export const getDarkMode = (): boolean => {
  return settingsStore.get('isDarkMode', false)
}

export const setDarkMode = (isDark: boolean): void => {
  settingsStore.set('isDarkMode', isDark)
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
