import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import {
  getSettings,
  updateSettings,
  resetSettings,
  setOsuStableSongsPath,
  setOsuLazerResolvedDataPath,
  type Settings as AppSettings
} from '../../services/settingsStore'
import { probeStablePath, probeLazerPath } from '../../services/pathAutoDetect'
import { validateDownloadPath } from '../../services/download/fileUtils'
import type { StartupAutoDetectResult } from '../../services/startupAutoDetect'
import DownloadService, { DownloadEvent, DownloadTask } from '../../services/downloadService'
import BeatmapMirrorService from '../../services/beatmapMirrorService'
import SyncManager from '../../services/database/syncManager'
import { DatabaseService } from '../../services/database/databaseService'
import { exportService, type ExportOptions } from '../../services/exportService'
import { collectionService } from '../../services/collection/collectionService'
import CollectionSyncService from '../../services/collection/collectionSyncService'
import type { DownloadOptions } from '../../services/download/types'
import type {
  DownloadPushEvent,
  DownloadQueueSummary,
  PathValidationResult,
  PreviewCollectionOptions
} from '../../preload/electronApiTypes'

let startupAutoDetectResult: StartupAutoDetectResult = {
  didUpdateStablePath: false,
  didUpdateLazerPath: false,
  showWarning: false
}

export function setStartupAutoDetectResult(result: StartupAutoDetectResult): void {
  startupAutoDetectResult = result
}

function serializeTask(task: DownloadTask): DownloadTask {
  return {
    id: task.id,
    beatmapsetId: task.beatmapsetId,
    mirror:
      typeof task.mirror === 'object' && task.mirror !== null
        ? ((task.mirror as unknown as { name?: string }).name ?? String(task.mirror))
        : String(task.mirror),
    noVideo: task.noVideo,
    status: task.status,
    progress: task.progress,
    speed: task.speed,
    remainingTime: task.remainingTime,
    error: task.error ?? null,
    downloadPath: task.downloadPath ?? null,
    fileName: task.fileName ?? null,
    filePath: task.filePath ?? null
  } as unknown as DownloadTask
}

export function registerIpcHandlers(mainWindow: BrowserWindow): () => void {
  // Remove any previously registered handlers to avoid collision
  const registeredChannels = [
    'settings:get',
    'settings:update',
    'settings:reset',
    'settings:validate-path',
    'settings:get-auto-detect-status',
    'download:start',
    'download:control',
    'download:get-state',
    'download:handle-recovery',
    'download:get-tasks',
    'database:get-status',
    'database:sync',
    'database:sync-collections',
    'database:get-collection-status',
    'database:filter-beatmaps',
    'backup:preview-collections',
    'backup:estimate',
    'backup:export',
    'system:select-directory',
    'system:select-backup-file',
    'system:open-path',
    'system:get-mirrors-status'
  ]

  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel)
  }

  // --- 1. SETTINGS DOMAIN ---
  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    return getSettings()
  })

  ipcMain.handle(
    'settings:update',
    async (_event, patch: Partial<AppSettings>): Promise<{ success: boolean }> => {
      updateSettings(patch)
      return { success: true }
    }
  )

  ipcMain.handle('settings:reset', async (): Promise<{ success: boolean }> => {
    resetSettings()
    return { success: true }
  })

  ipcMain.handle(
    'settings:validate-path',
    async (
      _event,
      target: 'stable' | 'lazer' | 'download',
      customPath?: string
    ): Promise<PathValidationResult> => {
      const settings = getSettings()

      if (target === 'stable') {
        const checkPath = customPath ?? settings.osuStablePath
        if (!checkPath) return { valid: false, error: 'No path set' }
        try {
          const probe = probeStablePath(checkPath)
          if (probe.valid) {
            if (probe.songsPath) {
              setOsuStableSongsPath(probe.songsPath)
            }
            return { valid: true, error: null }
          }
          return { valid: false, error: 'Invalid osu!stable directory' }
        } catch {
          return { valid: false, error: 'Path validation failed' }
        }
      }

      if (target === 'lazer') {
        const checkPath = customPath ?? settings.osuLazerPath
        if (!checkPath) return { valid: false, error: 'No path set' }
        try {
          const probe = probeLazerPath(checkPath)
          if (probe.valid) {
            if (probe.resolvedDataPath) {
              setOsuLazerResolvedDataPath(probe.resolvedDataPath)
            }
            return { valid: true, error: null }
          }
          return { valid: false, error: 'client.realm database not found' }
        } catch {
          return { valid: false, error: 'Path validation failed' }
        }
      }

      if (target === 'download') {
        const checkPath = customPath ?? settings.downloadPath
        if (!checkPath || checkPath.trim().length === 0) {
          return { valid: false, error: 'No path provided' }
        }
        try {
          await validateDownloadPath(checkPath)
          return { valid: true, error: null }
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Path validation failed'
          }
        }
      }

      return { valid: false, error: 'Invalid validation target' }
    }
  )

  ipcMain.handle('settings:get-auto-detect-status', async (): Promise<StartupAutoDetectResult> => {
    return startupAutoDetectResult
  })

  // --- 2. DOWNLOAD DOMAIN ---
  ipcMain.handle(
    'download:start',
    async (
      _event,
      payload: { filePath: string; options: DownloadOptions; downloadPath?: string }
    ) => {
      const { filePath, options, downloadPath } = payload
      if (!filePath || !options) {
        throw new Error('Missing required fields')
      }
      if (!fs.existsSync(filePath)) {
        throw new Error('File not found')
      }
      if (!options.threadCount || !options.sources || !Array.isArray(options.sources)) {
        throw new Error('Invalid options')
      }

      const downloadService = DownloadService.getInstance()
      const optionsWithPath = {
        ...options,
        downloadPath:
          typeof downloadPath === 'string' && downloadPath.trim().length > 0
            ? downloadPath
            : options.downloadPath
      }
      await downloadService.startDownload(filePath, optionsWithPath)
      return { success: true, message: 'Download started' }
    }
  )

  ipcMain.handle('download:control', async (_event, action: 'pause' | 'resume' | 'stop') => {
    const downloadService = DownloadService.getInstance()
    if (action === 'pause') {
      await downloadService.pauseQueue()
    } else if (action === 'resume') {
      downloadService.resumeQueue()
    } else if (action === 'stop') {
      void downloadService.discardRecoveryState()
      downloadService.clearQueue()
    }
    return { success: true }
  })

  ipcMain.handle('download:get-state', async () => {
    const downloadService = DownloadService.getInstance()
    return {
      runtime: downloadService.getQueueRuntimeState(),
      recovery: downloadService.getRecoveryState()
    }
  })

  ipcMain.handle('download:handle-recovery', async (_event, action: 'resume' | 'discard') => {
    const downloadService = DownloadService.getInstance()
    if (action === 'resume') {
      const resumed = await downloadService.resumeRecoveredQueue()
      return { success: resumed }
    } else {
      await downloadService.discardRecoveryState()
      return { success: true }
    }
  })

  ipcMain.handle('download:get-tasks', async () => {
    const downloadService = DownloadService.getInstance()
    return downloadService.getTasks().map(serializeTask)
  })

  // Setup Download Event Dispatcher
  const downloadService = DownloadService.getInstance()
  const chunkSize = 500
  const pendingAddedTasks: DownloadTask[] = []
  let addedTasksFlushTimer: NodeJS.Timeout | undefined

  const sendDownloadPush = (event: DownloadPushEvent): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download:push-event', event)
    }
  }

  const flushAddedTasks = (): void => {
    if (pendingAddedTasks.length === 0) return
    const tasksToSend = pendingAddedTasks.splice(0).map(serializeTask)
    sendDownloadPush({ event: 'tasksAdded', data: tasksToSend })
  }

  const scheduleAddedTasksFlush = (task: DownloadTask): void => {
    pendingAddedTasks.push(task)
    if (pendingAddedTasks.length >= chunkSize) {
      if (addedTasksFlushTimer) {
        clearTimeout(addedTasksFlushTimer)
        addedTasksFlushTimer = undefined
      }
      flushAddedTasks()
      return
    }
    if (!addedTasksFlushTimer) {
      addedTasksFlushTimer = setTimeout(() => {
        addedTasksFlushTimer = undefined
        flushAddedTasks()
      }, 50)
    }
  }

  const sendAfterPendingAdds = (
    eventType: 'taskUpdated' | 'taskCompleted' | 'taskError',
    task: DownloadTask
  ): void => {
    if (addedTasksFlushTimer) {
      clearTimeout(addedTasksFlushTimer)
      addedTasksFlushTimer = undefined
    }
    flushAddedTasks()
    sendDownloadPush({ event: eventType, data: serializeTask(task) })
  }

  const onTaskAdded = (task: DownloadTask): void => scheduleAddedTasksFlush(task)
  const onTaskUpdated = (task: DownloadTask): void => sendAfterPendingAdds('taskUpdated', task)
  const onTaskCompleted = (task: DownloadTask): void => sendAfterPendingAdds('taskCompleted', task)
  const onTaskError = (task: DownloadTask): void => sendAfterPendingAdds('taskError', task)
  const onQueuePaused = (): void => sendDownloadPush({ event: 'queuePaused', data: null })
  const onQueueResumed = (): void => sendDownloadPush({ event: 'queueResumed', data: null })
  const onQueueCleared = (): void => sendDownloadPush({ event: 'queueCleared', data: null })
  const onQueueCompleted = (summary: unknown): void =>
    sendDownloadPush({ event: 'queueCompleted', data: summary as DownloadQueueSummary })

  downloadService.on(DownloadEvent.TASK_ADDED, onTaskAdded)
  downloadService.on(DownloadEvent.TASK_UPDATED, onTaskUpdated)
  downloadService.on(DownloadEvent.TASK_COMPLETED, onTaskCompleted)
  downloadService.on(DownloadEvent.TASK_ERROR, onTaskError)
  downloadService.on(DownloadEvent.QUEUE_PAUSED, onQueuePaused)
  downloadService.on(DownloadEvent.QUEUE_RESUMED, onQueueResumed)
  downloadService.on(DownloadEvent.QUEUE_CLEARED, onQueueCleared)
  downloadService.on(DownloadEvent.QUEUE_COMPLETED, onQueueCompleted)

  // --- 3. DATABASE DOMAIN ---
  ipcMain.handle('database:get-status', async () => {
    const syncManager = SyncManager.getInstance()
    return syncManager.getStatus()
  })

  ipcMain.handle(
    'database:sync',
    async (
      _event,
      options?: { source?: 'stable' | 'lazer' | 'all'; force?: boolean }
    ): Promise<{ success: boolean }> => {
      const source = options?.source ?? 'all'
      const force = options?.force !== false
      if (!['stable', 'lazer', 'all'].includes(source)) {
        throw new Error('Invalid source. Expected stable, lazer, or all.')
      }
      const syncManager = SyncManager.getInstance()
      void syncManager.runManualSync(source, force)
      return { success: true }
    }
  )

  ipcMain.handle('database:sync-collections', async () => {
    const result = await CollectionSyncService.getInstance().requestManualSync()
    return {
      success: true,
      ...result,
      status: CollectionSyncService.getInstance().getStatus()
    }
  })

  ipcMain.handle('database:get-collection-status', async () => {
    return CollectionSyncService.getInstance().getStatus()
  })

  ipcMain.handle('database:filter-beatmaps', async (_event, filter: Record<string, unknown>) => {
    const db = DatabaseService.getInstance()
    return db.filterBeatmaps(filter)
  })

  // Database sync event dispatcher
  const syncManager = SyncManager.getInstance()
  const onSyncEvent = (event: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('database:sync-progress', event)
    }
  }
  syncManager.on('sync', onSyncEvent)

  // --- 4. BACKUP DOMAIN ---
  ipcMain.handle(
    'backup:preview-collections',
    async (_event, options: PreviewCollectionOptions) => {
      return collectionService.previewCollections({
        stable: options.stable,
        lazer: options.lazer,
        mergeMode: options.mergeMode
      })
    }
  )

  ipcMain.handle('backup:estimate', async (_event, options: ExportOptions) => {
    return exportService.estimateExportData(options)
  })

  ipcMain.handle('backup:export', async (_event, options: ExportOptions) => {
    return exportService.exportData(options, (progress) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('backup:local-export-progress', progress)
      }
    })
  })

  // --- 5. SYSTEM & DIALOG DOMAIN ---
  ipcMain.handle('system:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? '' : result.filePaths[0]
  })

  ipcMain.handle('system:select-backup-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Beatmap Backup Files', extensions: ['bbak'] }]
    })
    if (result.canceled) {
      throw new Error('No file selected')
    }
    return result.filePaths[0]
  })

  ipcMain.handle('system:open-path', async (_event, targetPath: string) => {
    try {
      return await shell.openPath(targetPath)
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to open path'
    }
  })

  ipcMain.handle('system:get-mirrors-status', async () => {
    const mirrorService = BeatmapMirrorService.getInstance()
    return mirrorService.getMirrorsStatus()
  })

  // Return cleanup function
  return () => {
    if (addedTasksFlushTimer) {
      clearTimeout(addedTasksFlushTimer)
      addedTasksFlushTimer = undefined
    }
    downloadService.removeListener(DownloadEvent.TASK_ADDED, onTaskAdded)
    downloadService.removeListener(DownloadEvent.TASK_UPDATED, onTaskUpdated)
    downloadService.removeListener(DownloadEvent.TASK_COMPLETED, onTaskCompleted)
    downloadService.removeListener(DownloadEvent.TASK_ERROR, onTaskError)
    downloadService.removeListener(DownloadEvent.QUEUE_PAUSED, onQueuePaused)
    downloadService.removeListener(DownloadEvent.QUEUE_RESUMED, onQueueResumed)
    downloadService.removeListener(DownloadEvent.QUEUE_CLEARED, onQueueCleared)
    downloadService.removeListener(DownloadEvent.QUEUE_COMPLETED, onQueueCompleted)
    syncManager.removeListener('sync', onSyncEvent)
  }
}
