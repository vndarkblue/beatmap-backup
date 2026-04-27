/// <reference types="vite/client" />

import type { ElectronApi } from '../../preload/electronApiTypes'

declare global {
  interface Window {
    electronAPI: ElectronApi
  }
}
