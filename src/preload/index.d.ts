import { ElectronAPI } from '@electron-toolkit/preload'
import type { ElectronApi } from './electronApiTypes'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: ElectronApi
  }
}
