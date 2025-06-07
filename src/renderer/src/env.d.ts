/// <reference types="vite/client" />

interface IpcRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(channel: string, listener: (...args: any[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(channel: string, listener: (...args: any[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(channel: string, ...args: any[]): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke(channel: string, ...args: any[]): Promise<any>
}

interface ElectronAPI {
  selectDirectory: () => Promise<string>
  checkSubDir: (dir: string, sub: string) => Promise<boolean>
  checkFile: (dir: string, file: string) => Promise<boolean>
  exportData: (options: { stable: boolean, lazer: boolean }) => Promise<void>
}

declare global {
  interface Window {
    ipcRenderer: IpcRenderer
    electronAPI: ElectronAPI
  }
}
