import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  ElectronApi,
  AppSettings,
  DownloadOptions,
  DownloadPushEvent,
  PreviewCollectionOptions,
  ExportDataOptions,
  LocalExportProgress,
  SyncProgressEvent
} from './electronApiTypes'

const electronAPI: ElectronApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    validatePath: (target: 'stable' | 'lazer' | 'download', customPath?: string) =>
      ipcRenderer.invoke('settings:validate-path', target, customPath),
    getAutoDetectStatus: () => ipcRenderer.invoke('settings:get-auto-detect-status')
  },
  download: {
    start: (payload: { filePath: string; options: DownloadOptions; downloadPath?: string }) =>
      ipcRenderer.invoke('download:start', payload),
    control: (action: 'pause' | 'resume' | 'stop') =>
      ipcRenderer.invoke('download:control', action),
    getState: () => ipcRenderer.invoke('download:get-state'),
    handleRecovery: (action: 'resume' | 'discard') =>
      ipcRenderer.invoke('download:handle-recovery', action),
    getTasks: () => ipcRenderer.invoke('download:get-tasks'),
    onEvent: (listener: (event: DownloadPushEvent) => void) => {
      const handler = (_: IpcRendererEvent, event: DownloadPushEvent): void => listener(event)
      ipcRenderer.on('download:push-event', handler)
      return () => {
        ipcRenderer.removeListener('download:push-event', handler)
      }
    }
  },
  database: {
    getStatus: () => ipcRenderer.invoke('database:get-status'),
    sync: (options?: { source?: 'stable' | 'lazer' | 'all'; force?: boolean }) =>
      ipcRenderer.invoke('database:sync', options),
    syncCollections: () => ipcRenderer.invoke('database:sync-collections'),
    getCollectionStatus: () => ipcRenderer.invoke('database:get-collection-status'),
    filterBeatmaps: (filter: Record<string, unknown>) =>
      ipcRenderer.invoke('database:filter-beatmaps', filter),
    onSyncProgress: (listener: (progress: SyncProgressEvent) => void) => {
      const handler = (_: IpcRendererEvent, progress: SyncProgressEvent): void => listener(progress)
      ipcRenderer.on('database:sync-progress', handler)
      return () => {
        ipcRenderer.removeListener('database:sync-progress', handler)
      }
    }
  },
  backup: {
    previewCollections: (options: PreviewCollectionOptions) =>
      ipcRenderer.invoke('backup:preview-collections', options),
    estimate: (options: ExportDataOptions) => ipcRenderer.invoke('backup:estimate', options),
    export: (options: ExportDataOptions) => ipcRenderer.invoke('backup:export', options),
    onLocalExportProgress: (listener: (progress: LocalExportProgress) => void) => {
      const handler = (_: IpcRendererEvent, progress: LocalExportProgress): void =>
        listener(progress)
      ipcRenderer.on('backup:local-export-progress', handler)
      return () => {
        ipcRenderer.removeListener('backup:local-export-progress', handler)
      }
    }
  },
  system: {
    selectDirectory: () => ipcRenderer.invoke('system:select-directory'),
    selectBackupFile: () => ipcRenderer.invoke('system:select-backup-file'),
    openPath: (targetPath: string) => ipcRenderer.invoke('system:open-path', targetPath),
    getMirrorsStatus: () => ipcRenderer.invoke('system:get-mirrors-status')
  }
}

// Expose APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
