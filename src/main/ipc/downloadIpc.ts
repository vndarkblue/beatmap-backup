import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import DownloadService, { DownloadEvent, DownloadTask } from '../../services/downloadService'
import type { DownloadOptions } from '../../services/download/types'
import type { DownloadPushEvent, DownloadQueueSummary } from '../../preload/electronApiTypes'

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
    filePath: task.filePath ?? null,
    beatmapTitle: task.beatmapTitle ?? null
  } as unknown as DownloadTask
}

export function registerDownloadIpc(mainWindow: BrowserWindow): () => void {
  const channels = [
    'download:start',
    'download:control',
    'download:get-state',
    'download:handle-recovery',
    'download:get-tasks',
    'download:retry-failed',
    'download:clear-queue',
    'download:export-failed-backup'
  ]

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

  // Setup Download Event Dispatcher
  const chunkSize = 500
  const pendingAddedTasks: DownloadTask[] = []
  let addedTasksFlushTimer: NodeJS.Timeout | undefined

  const pendingUpdatedTasks = new Map<string, DownloadTask>()
  let updatedTasksFlushTimer: NodeJS.Timeout | undefined

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

  const flushUpdatedTasks = (): void => {
    if (pendingUpdatedTasks.size === 0) return
    const tasksToSend: DownloadTask[] = []
    for (const task of pendingUpdatedTasks.values()) {
      tasksToSend.push(serializeTask(task))
    }
    pendingUpdatedTasks.clear()
    sendDownloadPush({ event: 'tasksUpdated', data: tasksToSend })
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

  const scheduleTaskUpdateFlush = (task: DownloadTask): void => {
    pendingUpdatedTasks.set(task.id, task)
    if (!updatedTasksFlushTimer) {
      updatedTasksFlushTimer = setTimeout(() => {
        updatedTasksFlushTimer = undefined
        flushUpdatedTasks()
      }, 150)
    }
  }

  const sendTerminalTaskEvent = (
    eventType: 'taskCompleted' | 'taskError',
    task: DownloadTask
  ): void => {
    if (addedTasksFlushTimer) {
      clearTimeout(addedTasksFlushTimer)
      addedTasksFlushTimer = undefined
    }
    flushAddedTasks()
    pendingUpdatedTasks.delete(task.id)
    flushUpdatedTasks()
    sendDownloadPush({ event: eventType, data: serializeTask(task) })
  }

  const onTaskAdded = (task: DownloadTask): void => scheduleAddedTasksFlush(task)
  const onTaskUpdated = (task: DownloadTask): void => scheduleTaskUpdateFlush(task)
  const onTaskCompleted = (task: DownloadTask): void => sendTerminalTaskEvent('taskCompleted', task)
  const onTaskError = (task: DownloadTask): void => sendTerminalTaskEvent('taskError', task)
  const onQueuePaused = (): void => sendDownloadPush({ event: 'queuePaused', data: null })
  const onQueueResumed = (): void => sendDownloadPush({ event: 'queueResumed', data: null })
  const onQueueCleared = (): void => sendDownloadPush({ event: 'queueCleared', data: null })
  const onQueueCompleted = (summary: unknown): void =>
    sendDownloadPush({ event: 'queueCompleted', data: summary as DownloadQueueSummary })

  let downloadServiceInstance: DownloadService | null = null

  const getDownloadService = (): DownloadService => {
    if (!downloadServiceInstance) {
      downloadServiceInstance = DownloadService.getInstance()
      downloadServiceInstance.on(DownloadEvent.TASK_ADDED, onTaskAdded)
      downloadServiceInstance.on(DownloadEvent.TASK_UPDATED, onTaskUpdated)
      downloadServiceInstance.on(DownloadEvent.TASK_COMPLETED, onTaskCompleted)
      downloadServiceInstance.on(DownloadEvent.TASK_ERROR, onTaskError)
      downloadServiceInstance.on(DownloadEvent.QUEUE_PAUSED, onQueuePaused)
      downloadServiceInstance.on(DownloadEvent.QUEUE_RESUMED, onQueueResumed)
      downloadServiceInstance.on(DownloadEvent.QUEUE_CLEARED, onQueueCleared)
      downloadServiceInstance.on(DownloadEvent.QUEUE_COMPLETED, onQueueCompleted)
    }
    return downloadServiceInstance
  }

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

      const optionsWithPath = {
        ...options,
        downloadPath:
          typeof downloadPath === 'string' && downloadPath.trim().length > 0
            ? downloadPath
            : options.downloadPath
      }
      await getDownloadService().startDownload(filePath, optionsWithPath)
      return { success: true, message: 'Download started' }
    }
  )

  ipcMain.handle('download:control', async (_event, action: 'pause' | 'resume' | 'stop') => {
    if (action === 'pause') {
      await getDownloadService().pauseQueue()
    } else if (action === 'resume') {
      getDownloadService().resumeQueue()
    } else if (action === 'stop') {
      void getDownloadService().discardRecoveryState()
      getDownloadService().clearQueue()
    }
    return { success: true }
  })

  ipcMain.handle('download:get-state', async () => {
    const ds = getDownloadService()
    return {
      runtime: ds.getQueueRuntimeState(),
      recovery: ds.getRecoveryState()
    }
  })

  ipcMain.handle('download:handle-recovery', async (_event, action: 'resume' | 'discard') => {
    if (action === 'resume') {
      const resumed = await getDownloadService().resumeRecoveredQueue()
      return { success: resumed }
    } else {
      await getDownloadService().discardRecoveryState()
      return { success: true }
    }
  })

  ipcMain.handle('download:get-tasks', async () => {
    return getDownloadService().getTasks().map(serializeTask)
  })

  ipcMain.handle('download:retry-failed', async () => {
    const retriedCount = getDownloadService().retryFailedTasks()
    return { success: true, count: retriedCount }
  })

  ipcMain.handle('download:clear-queue', async () => {
    getDownloadService().clearQueue()
    return { success: true }
  })

  ipcMain.handle('download:export-failed-backup', async () => {
    const failedIds = getDownloadService().getFailedTaskBeatmapsetIds()
    if (failedIds.length === 0) {
      return { success: false, error: 'No failed beatmaps to export' }
    }
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Failed Beatmaps',
      defaultPath: `osu-failed-beatmaps-${new Date().toISOString().slice(0, 10)}.bbak`,
      filters: [{ name: 'Beatmap Backup Files', extensions: ['bbak'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, error: 'cancelled' }
    }
    const content = [
      '# osu! beatmap backup file (Failed Downloads)',
      `# Exported: ${new Date().toISOString()}`,
      `# Total Beatmapsets: ${failedIds.length}`,
      ...failedIds
    ].join('\n')
    await fs.promises.writeFile(saveResult.filePath, `${content}\n`, 'utf-8')
    return { success: true, count: failedIds.length, filePath: saveResult.filePath }
  })

  return () => {
    if (addedTasksFlushTimer) {
      clearTimeout(addedTasksFlushTimer)
      addedTasksFlushTimer = undefined
    }
    if (updatedTasksFlushTimer) {
      clearTimeout(updatedTasksFlushTimer)
      updatedTasksFlushTimer = undefined
    }
    pendingAddedTasks.length = 0
    pendingUpdatedTasks.clear()
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
    if (downloadServiceInstance) {
      downloadServiceInstance.removeListener(DownloadEvent.TASK_ADDED, onTaskAdded)
      downloadServiceInstance.removeListener(DownloadEvent.TASK_UPDATED, onTaskUpdated)
      downloadServiceInstance.removeListener(DownloadEvent.TASK_COMPLETED, onTaskCompleted)
      downloadServiceInstance.removeListener(DownloadEvent.TASK_ERROR, onTaskError)
      downloadServiceInstance.removeListener(DownloadEvent.QUEUE_PAUSED, onQueuePaused)
      downloadServiceInstance.removeListener(DownloadEvent.QUEUE_RESUMED, onQueueResumed)
      downloadServiceInstance.removeListener(DownloadEvent.QUEUE_CLEARED, onQueueCleared)
      downloadServiceInstance.removeListener(DownloadEvent.QUEUE_COMPLETED, onQueueCompleted)
    }
  }
}
