/// <reference types="vite/client" />

import type { ElectronApi } from '../../preload/electronApiTypes'

declare global {
  const __APP_VERSION__: string
  interface Window {
    electronAPI: ElectronApi
  }
}
