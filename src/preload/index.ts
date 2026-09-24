import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  ElectronApi,
  AppSettings,
  DownloadOptions,
  DownloadPushEvent,
  PreviewCollectionOptions,
  ExportDataOptions,
  LocalExportProgress,
  SyncProgressEvent,
  UpdatePushEvent
} from './electronApiTypes'

const electronAPI: ElectronApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset'),
    validatePath: (target: 'stable' | 'lazer' | 'download', customPath?: string) =>
      ipcRenderer.invoke('settings:validate-path', target, customPath),
    getAutoDetectStatus: () => ipcRenderer.invoke('settings:get-auto-detect-status'),
    hasBeatconnectToken: () => ipcRenderer.invoke('settings:has-beatconnect-token'),
    setBeatconnectToken: (token: string) =>
      ipcRenderer.invoke('settings:set-beatconnect-token', token)
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
    retryFailed: () => ipcRenderer.invoke('download:retry-failed'),
    clearQueue: () => ipcRenderer.invoke('download:clear-queue'),
    exportFailedBackup: () => ipcRenderer.invoke('download:export-failed-backup'),
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
    openExternal: (url: string) => ipcRenderer.invoke('system:open-external', url),
    showItemInFolder: (targetPath: string) =>
      ipcRenderer.invoke('system:show-item-in-folder', targetPath),
    getMirrorsStatus: () => ipcRenderer.invoke('system:get-mirrors-status'),
    openLogFolder: () => ipcRenderer.invoke('system:open-log-folder'),
    getDiagnosticInfo: () => ipcRenderer.invoke('system:get-diagnostic-info'),
    reportRendererError: (payload: { message: string; stack?: string; component?: string }) =>
      ipcRenderer.send('system:report-renderer-error', payload)
  },
  updater: {
    getAppVersion: () => ipcRenderer.invoke('updater:get-app-version'),
    getDistributionType: () => ipcRenderer.invoke('updater:get-distribution-type'),
    getLastCheckResult: () => ipcRenderer.invoke('updater:get-last-result'),
    getUpdateState: () => ipcRenderer.invoke('updater:get-update-state'),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    installUpdate: () => ipcRenderer.send('updater:install'),
    openReleasePage: (version?: string) => ipcRenderer.invoke('updater:open-release', version),
    downloadLinuxAppImage: (version?: string) =>
      ipcRenderer.invoke('updater:download-linux-appimage', version),
    showInstallConfirm: (options: {
      title: string
      message: string
      detail?: string
      confirmLabel: string
      cancelLabel: string
    }) => ipcRenderer.invoke('updater:show-install-confirm', options),
    onEvent: (listener: (event: UpdatePushEvent) => void) => {
      const handler = (_: IpcRendererEvent, event: UpdatePushEvent): void => listener(event)
      ipcRenderer.on('updater:push-event', handler)
      return () => {
        ipcRenderer.removeListener('updater:push-event', handler)
      }
    }
  },
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (listener: (isMaximized: boolean) => void) => {
      const handler = (_: IpcRendererEvent, isMax: boolean): void => listener(isMax)
      ipcRenderer.on('window:maximize-change', handler)
      return () => {
        ipcRenderer.removeListener('window:maximize-change', handler)
      }
    }
  }
}

// Expose APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI)
