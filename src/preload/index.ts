console.log('Preload script is running')

import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronApi, ExportDataOptions, PreviewCollectionOptions } from './electronApiTypes'

// Log when preload script is loaded
console.log('Preload script loaded')

const electronAPI: ElectronApi = {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  checkSubDir: (dir: string, sub: string) => ipcRenderer.invoke('check-subdir', dir, sub),
  checkFile: (dir: string, file: string) => ipcRenderer.invoke('check-file', dir, file),
  getFilePath: () => ipcRenderer.invoke('get-file-path'),
  previewCollections: (options: PreviewCollectionOptions) =>
    ipcRenderer.invoke('preview-collections', options),
  syncCollectionMd5Cache: () => ipcRenderer.invoke('sync-collection-md5-cache'),
  getCollectionSyncStatus: () => ipcRenderer.invoke('get-collection-sync-status'),
  exportData: async (options: ExportDataOptions) => {
    console.log('Preload: Calling exportData with options:', options)
    const result = await ipcRenderer.invoke('export-data', options)
    console.log('Preload: Received result from main process:', result)
    return result
  },
  openPath: (targetPath: string) => ipcRenderer.invoke('open-path', targetPath)
}

// Expose APIs to renderer process
console.log('Exposing APIs to renderer process')
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
console.log('APIs exposed successfully')
