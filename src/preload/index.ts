console.log('Preload script is running')

import { contextBridge, ipcRenderer } from 'electron'

// Log when preload script is loaded
console.log('Preload script loaded')

// Custom APIs for renderer
const api = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(...args: [string, (...args: any[]) => void]) {
    const [channel, listener] = args
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ipcRenderer.on(channel, (event: Electron.IpcRendererEvent, ...args: any[]) =>
      listener(event, ...args)
    )
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(...args: [string, (...args: any[]) => void]) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(...args: [string, ...any[]]) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoke(...args: [string, ...any[]]) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  }
}

const electronAPI = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  checkSubDir: (dir: string, sub: string) => ipcRenderer.invoke('check-subdir', dir, sub),
  checkFile: (dir: string, file: string) => ipcRenderer.invoke('check-file', dir, file),
  getFilePath: (file: File) => ipcRenderer.invoke('get-file-path', file),
  exportData: async (options: { stable: boolean; lazer: boolean }) => {
    console.log('Preload: Calling exportData with options:', options)
    const result = await ipcRenderer.invoke('export-data', options)
    console.log('Preload: Received result from main process:', result)
    return result
  },
  openPath: (targetPath: string) => ipcRenderer.invoke('open-path', targetPath)
}

// Expose APIs to renderer process
console.log('Exposing APIs to renderer process')
contextBridge.exposeInMainWorld('ipcRenderer', api)
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
console.log('APIs exposed successfully')
