import Store from 'electron-store'

interface Settings {
  osuStablePath: string
  osuLazerPath: string
  isDarkMode: boolean
  downloadThreadCount: number
  selectedMirrors: string[]
  rememberDownloadPath: boolean
  lastDownloadPath: string
}

const defaultSettings: Settings = {
  osuStablePath: '',
  osuLazerPath: '',
  isDarkMode: false,
  downloadThreadCount: 5,
  selectedMirrors: [],
  rememberDownloadPath: true,
  lastDownloadPath: ''
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
    rememberDownloadPath: settingsStore.get('rememberDownloadPath', true),
    lastDownloadPath: settingsStore.get('lastDownloadPath', '')
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

export const getRememberDownloadPath = (): boolean => {
  return settingsStore.get('rememberDownloadPath', true)
}

export const setRememberDownloadPath = (remember: boolean): void => {
  settingsStore.set('rememberDownloadPath', remember)
}

export const getLastDownloadPath = (): string => {
  return settingsStore.get('lastDownloadPath', '')
}

export const setLastDownloadPath = (path: string): void => {
  settingsStore.set('lastDownloadPath', path)
}
