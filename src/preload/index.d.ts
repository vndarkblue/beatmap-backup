import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    electronAPI: {
      selectDirectory: () => Promise<string>
      checkSubDir: (dir: string, sub: string) => Promise<boolean>
      checkFile: (dir: string, file: string) => Promise<boolean>
      getFilePath: () => Promise<string>
      exportData: (options: { stable: boolean; lazer: boolean }) => Promise<{
        success: boolean
        count: number
        outputPath: string
        error?: string
      }>
    }
  }
}
