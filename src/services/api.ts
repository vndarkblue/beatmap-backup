import express, { Request, Response, RequestHandler } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { Server } from 'http'
import {
  getSettings,
  setOsuStablePath,
  setOsuLazerPath,
  resetSettings,
  getWaitForDownloadsOnPause,
  setWaitForDownloadsOnPause,
  getDownloadPath,
  setDownloadPath
} from './settingsStore'
import fs from 'fs'
import path from 'path'
import BeatmapMirrorService from './beatmapMirrorService'
import DownloadService, { DownloadEvent, DownloadTask } from './downloadService'
import { validateDownloadPath } from './download/fileUtils'
import SyncManager from './database/syncManager'
import type { SyncProgressEvent } from './database/types'
import { DatabaseService } from './database/databaseService'
import { startupMark } from './startupTrace'
import { runStartupAutoDetect, type StartupAutoDetectResult } from './startupAutoDetect'
import { BACKEND_API_ROUTES, BACKEND_SERVER } from '../config/backendConstants'

const app = express()
const port = BACKEND_SERVER.PORT
let httpServer: Server
let startupAutoDetectResult: StartupAutoDetectResult = {
  didUpdateStablePath: false,
  didUpdateLazerPath: false,
  showWarning: false
}

// Middleware
app.use(
  cors({
    origin: '*', // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Settings endpoints
app.get(BACKEND_API_ROUTES.SETTINGS, ((_req: Request, res: Response) => {
  res.json(getSettings())
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.SETTINGS_AUTO_DETECT_STATUS, ((_req: Request, res: Response) => {
  res.json(startupAutoDetectResult)
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.SETTINGS_OSU_STABLE, ((req: Request, res: Response) => {
  const { path } = req.body
  if (typeof path === 'string') {
    setOsuStablePath(path)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid path' })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.SETTINGS_OSU_LAZER, ((req: Request, res: Response) => {
  const { path } = req.body
  if (typeof path === 'string') {
    setOsuLazerPath(path)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid path' })
  }
}) as RequestHandler)

// New endpoints for path validation
app.get(BACKEND_API_ROUTES.SETTINGS_VALIDATE_OSU_STABLE, (async (
  _req: Request,
  res: Response
): Promise<void> => {
  const settings = getSettings()
  if (!settings.osuStablePath) {
    res.json({ valid: false, error: 'No path set' })
    return
  }
  const target = path.join(settings.osuStablePath, 'Songs')

  try {
    const exists = fs.existsSync(target) && fs.lstatSync(target).isDirectory()
    res.json({ valid: exists, error: exists ? null : 'Songs directory not found' })
  } catch {
    res.json({ valid: false, error: 'Path validation failed' })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.SETTINGS_VALIDATE_OSU_LAZER, (async (
  _req: Request,
  res: Response
): Promise<void> => {
  const settings = getSettings()
  if (!settings.osuLazerPath) {
    res.json({ valid: false, error: 'No path set' })
    return
  }

  const primaryTarget = path.join(settings.osuLazerPath, 'client.realm')
  const fallbackTarget = path.join(settings.osuLazerPath, 'files', 'client.realm')

  try {
    const exists =
      (fs.existsSync(primaryTarget) && fs.lstatSync(primaryTarget).isFile()) ||
      (fs.existsSync(fallbackTarget) && fs.lstatSync(fallbackTarget).isFile())
    res.json({ valid: exists, error: exists ? null : 'client.realm file not found' })
  } catch {
    res.json({ valid: false, error: 'Path validation failed' })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.SETTINGS_RESET, ((_req: Request, res: Response) => {
  resetSettings()
  res.json({ success: true })
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.SETTINGS_WAIT_FOR_DOWNLOADS, ((_req: Request, res: Response) => {
  res.json({ waitForDownloadsOnPause: getWaitForDownloadsOnPause() })
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.SETTINGS_WAIT_FOR_DOWNLOADS, ((req: Request, res: Response) => {
  const { waitForDownloadsOnPause } = req.body
  if (typeof waitForDownloadsOnPause === 'boolean') {
    setWaitForDownloadsOnPause(waitForDownloadsOnPause)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid wait for downloads value' })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.SETTINGS_DOWNLOAD_PATH, ((_req: Request, res: Response) => {
  res.json({ downloadPath: getDownloadPath() })
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.SETTINGS_DOWNLOAD_PATH, ((req: Request, res: Response) => {
  const { path } = req.body
  if (typeof path === 'string') {
    setDownloadPath(path)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid download path' })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.SETTINGS_VALIDATE_DOWNLOAD_PATH, (async (
  req: Request,
  res: Response
): Promise<void> => {
  const downloadPath = req.query.path as string | undefined
  if (!downloadPath || downloadPath.trim().length === 0) {
    res.json({ valid: false, error: 'No path provided' })
    return
  }

  try {
    await validateDownloadPath(downloadPath)
    res.json({ valid: true, error: null })
  } catch (error) {
    res.json({
      valid: false,
      error: error instanceof Error ? error.message : 'Path validation failed'
    })
  }
}) as RequestHandler)

// Download endpoints
app.post(BACKEND_API_ROUTES.DOWNLOAD, (async (req: Request, res: Response): Promise<void> => {
  const { filePath, options, downloadPath } = req.body

  // Validate required fields
  if (!filePath || !options) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  // Validate file path
  if (!fs.existsSync(filePath)) {
    res.status(400).json({ error: 'File not found' })
    return
  }

  // Validate options
  if (!options.threadCount || !options.sources || !Array.isArray(options.sources)) {
    res.status(400).json({ error: 'Invalid options' })
    return
  }

  try {
    const downloadService = DownloadService.getInstance()
    const optionsWithPath = {
      ...options,
      // Only attach when provided; backend will validate existence/permission
      downloadPath:
        typeof downloadPath === 'string' && downloadPath.trim().length > 0
          ? downloadPath
          : options.downloadPath
    }
    await downloadService.startDownload(filePath, optionsWithPath)
    res.json({ success: true, message: 'Download started' })
  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Download failed'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.EXPORT_ESTIMATE, (async (
  req: Request,
  res: Response
): Promise<void> => {
  const { options } = req.body
  if (!options) {
    res.status(400).json({ error: 'Missing export options' })
    return
  }
  try {
    const { exportService } = await import('./exportService')
    const estimate = await exportService.estimateExportData(options)
    res.json({ success: true, ...estimate })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to estimate backup size'
    })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.DOWNLOAD_RECOVERY, (async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const downloadService = DownloadService.getInstance()
    res.json(downloadService.getRecoveryState())
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load recovery state'
    })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.DOWNLOAD_STATUS, ((_req: Request, res: Response) => {
  try {
    const downloadService = DownloadService.getInstance()
    res.json(downloadService.getQueueRuntimeState())
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get download status'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.DOWNLOAD_RECOVERY_RESUME, (async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const downloadService = DownloadService.getInstance()
    const resumed = await downloadService.resumeRecoveredQueue()
    res.json({ success: resumed })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to resume recovered queue'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.DOWNLOAD_RECOVERY_DISCARD, (async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const downloadService = DownloadService.getInstance()
    await downloadService.discardRecoveryState()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to discard recovery state'
    })
  }
}) as RequestHandler)

// SSE endpoint for download events
app.get(BACKEND_API_ROUTES.DOWNLOAD_EVENTS, (async (req: Request, res: Response): Promise<void> => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const downloadService = DownloadService.getInstance()

  // Helper to serialize tasks to a JSON-safe structure (avoid circular refs)
  const serializeTask = (
    task: DownloadTask
  ): {
    id: string
    beatmapsetId: string
    mirror: string
    noVideo: boolean
    status: DownloadTask['status']
    progress: number
    speed: number
    remainingTime: number
    error: string | null
    downloadPath: string | null
    fileName: string | null
    filePath: string | null
  } => ({
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
  })

  // Helper function to send events
  const sendEvent = (event: string, data: DownloadTask | DownloadTask[] | null): void => {
    res.write(`event: ${event}\n`)
    const safeData = Array.isArray(data)
      ? data.map((t) => serializeTask(t))
      : data === null
        ? null
        : serializeTask(data)
    res.write(`data: ${JSON.stringify(safeData)}\n\n`)
  }
  const pendingAddedTasks: DownloadTask[] = []
  let addedTasksFlushTimer: NodeJS.Timeout | undefined

  const flushAddedTasks = (): void => {
    if (pendingAddedTasks.length === 0) return
    const tasksToSend = pendingAddedTasks.splice(0)
    sendEvent('tasksAdded', tasksToSend)
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

  const sendAfterPendingAdds = (event: string, task: DownloadTask): void => {
    if (addedTasksFlushTimer) {
      clearTimeout(addedTasksFlushTimer)
      addedTasksFlushTimer = undefined
    }
    flushAddedTasks()
    sendEvent(event, task)
  }

  // Send initial state
  const tasks = downloadService.getTasks()
  const chunkSize = 500
  if (tasks.length <= chunkSize) {
    sendEvent('initialState', tasks)
  } else {
    for (let i = 0; i < tasks.length; i += chunkSize) {
      const chunk = tasks.slice(i, i + chunkSize)
      sendEvent('initialStateChunk', chunk)
    }
    sendEvent('initialStateComplete', null)
  }

  // Set up event listeners
  type DownloadQueueSummary = {
    total: number
    success: number
    failed: number
    downloadPath: string
    durationMs: number
  }

  const eventHandlers = {
    [DownloadEvent.TASK_ADDED]: (task: DownloadTask) => scheduleAddedTasksFlush(task),
    [DownloadEvent.TASK_UPDATED]: (task: DownloadTask) => sendAfterPendingAdds('taskUpdated', task),
    [DownloadEvent.TASK_COMPLETED]: (task: DownloadTask) =>
      sendAfterPendingAdds('taskCompleted', task),
    [DownloadEvent.TASK_ERROR]: (task: DownloadTask) => sendAfterPendingAdds('taskError', task),
    [DownloadEvent.QUEUE_PAUSED]: () => sendEvent('queuePaused', null),
    [DownloadEvent.QUEUE_RESUMED]: () => sendEvent('queueResumed', null),
    [DownloadEvent.QUEUE_CLEARED]: () => sendEvent('queueCleared', null),
    [DownloadEvent.QUEUE_COMPLETED]: (summary: unknown) => {
      const safe = summary as DownloadQueueSummary
      res.write(`event: queueCompleted\n`)
      res.write(`data: ${JSON.stringify(safe)}\n\n`)
    }
  }

  // Add event listeners
  Object.entries(eventHandlers).forEach(([event, handler]) => {
    downloadService.on(event, handler)
  })

  // Handle client disconnect
  req.on('close', () => {
    if (addedTasksFlushTimer) {
      clearTimeout(addedTasksFlushTimer)
      addedTasksFlushTimer = undefined
    }
    // Remove event listeners
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      downloadService.removeListener(event, handler)
    })
  })
}) as RequestHandler)

// Download control endpoints
app.post(BACKEND_API_ROUTES.DOWNLOAD_PAUSE, ((_req: Request, res: Response) => {
  try {
    const downloadService = DownloadService.getInstance()
    downloadService.pauseQueue()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to pause download'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.DOWNLOAD_RESUME, ((_req: Request, res: Response) => {
  try {
    const downloadService = DownloadService.getInstance()
    downloadService.resumeQueue()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to resume download'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.DOWNLOAD_STOP, ((_req: Request, res: Response) => {
  try {
    const downloadService = DownloadService.getInstance()
    void downloadService.discardRecoveryState()
    downloadService.clearQueue()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to stop download'
    })
  }
}) as RequestHandler)

// Mirror status endpoint
app.get(BACKEND_API_ROUTES.MIRRORS_STATUS, (async (_req: Request, res: Response) => {
  try {
    const mirrorService = BeatmapMirrorService.getInstance()
    const status = await mirrorService.getMirrorsStatus()
    res.json(status)
  } catch (error) {
    console.error('Failed to get mirror status:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get mirror status'
    })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.DATABASE_STATUS, ((_: Request, res: Response) => {
  try {
    const syncManager = SyncManager.getInstance()
    res.json(syncManager.getStatus())
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get database status'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.DATABASE_SYNC, (async (req: Request, res: Response): Promise<void> => {
  try {
    const source = req.body?.source as 'stable' | 'lazer' | 'all' | undefined
    const force = req.body?.force !== false
    const syncSource = source ?? 'all'
    if (!['stable', 'lazer', 'all'].includes(syncSource)) {
      res.status(400).json({ error: 'Invalid source. Expected stable, lazer, or all.' })
      return
    }
    const syncManager = SyncManager.getInstance()
    void syncManager.runManualSync(syncSource, force)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to trigger database sync'
    })
  }
}) as RequestHandler)

app.post(BACKEND_API_ROUTES.DATABASE_FILTER_BEATMAPS, ((req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance()
    const result = db.filterBeatmaps(req.body)
    res.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Filter failed'
    const status = message === 'Invalid filter body' ? 400 : 500
    res.status(status).json({ error: message })
  }
}) as RequestHandler)

app.get(BACKEND_API_ROUTES.DATABASE_SYNC_EVENTS, ((req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const syncManager = SyncManager.getInstance()
  const listener = (event: SyncProgressEvent): void => {
    res.write(`event: ${event.phase}\n`)
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  syncManager.on('sync', listener)
  req.on('close', () => {
    syncManager.removeListener('sync', listener)
  })
}) as RequestHandler)

export function startServer(): void {
  try {
    startupMark('api:startServer:begin')
    startupAutoDetectResult = runStartupAutoDetect()
    const mirrorService = BeatmapMirrorService.getInstance()
    mirrorService.startBackgroundHealthChecks()
    const downloadService = DownloadService.getInstance()
    void downloadService.preloadRecoveryState()
    const syncManager = SyncManager.getInstance()
    void syncManager.runStartupSync()

    httpServer = app.listen(port, () => {
      startupMark('api:startServer:listening', { port })
      console.log(`API server is running on port ${port}`)
      console.log(`Server URL: http://localhost:${port}`)
    })

    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Please try a different port.`)
      } else {
        console.error('Server error:', error)
      }
    })
  } catch (error) {
    console.error('Failed to start server:', error)
  }
}

export function stopServer(): void {
  if (httpServer) {
    const mirrorService = BeatmapMirrorService.getInstance()
    mirrorService.stopBackgroundHealthChecks()
    const downloadService = DownloadService.getInstance()
    void downloadService.flushCheckpointWithTimeout()
    httpServer.close(() => {
      console.log('API server stopped')
    })
  }
}
