import express, { Request, Response, RequestHandler } from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { Server } from 'http'
import {
  getSettings,
  setOsuStablePath,
  setOsuLazerPath,
  getDarkMode,
  setDarkMode
} from './settingsStore'
import fs from 'fs'
import path from 'path'
import BeatmapMirrorService from './beatmapMirrorService'
import DownloadService, { DownloadEvent, DownloadTask } from './downloadService'

const app = express()
const port = 3000
let httpServer: Server

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
app.get('/api/settings', ((_req: Request, res: Response) => {
  res.json(getSettings())
}) as RequestHandler)

app.post('/api/settings/osu-stable', ((req: Request, res: Response) => {
  const { path } = req.body
  if (typeof path === 'string') {
    setOsuStablePath(path)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid path' })
  }
}) as RequestHandler)

app.post('/api/settings/osu-lazer', ((req: Request, res: Response) => {
  const { path } = req.body
  if (typeof path === 'string') {
    setOsuLazerPath(path)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid path' })
  }
}) as RequestHandler)

// New endpoints for path validation
app.get('/api/settings/validate/osu-stable', (async (
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

app.get('/api/settings/validate/osu-lazer', (async (
  _req: Request,
  res: Response
): Promise<void> => {
  const settings = getSettings()
  if (!settings.osuLazerPath) {
    res.json({ valid: false, error: 'No path set' })
    return
  }

  const target = path.join(settings.osuLazerPath, 'client.realm')

  try {
    const exists = fs.existsSync(target) && fs.lstatSync(target).isFile()
    res.json({ valid: exists, error: exists ? null : 'client.realm file not found' })
  } catch {
    res.json({ valid: false, error: 'Path validation failed' })
  }
}) as RequestHandler)

app.get('/api/settings/dark-mode', ((_req: Request, res: Response) => {
  res.json({ isDarkMode: getDarkMode() })
}) as RequestHandler)

app.post('/api/settings/dark-mode', ((req: Request, res: Response) => {
  const { isDark } = req.body
  if (typeof isDark === 'boolean') {
    setDarkMode(isDark)
    res.json({ success: true })
  } else {
    res.status(400).json({ error: 'Invalid dark mode value' })
  }
}) as RequestHandler)

// Download endpoints
app.post('/api/download', (async (req: Request, res: Response): Promise<void> => {
  const { filePath, options } = req.body

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
    await downloadService.startDownload(filePath, options)
    res.json({ success: true, message: 'Download started' })
  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Download failed'
    })
  }
}) as RequestHandler)

// SSE endpoint for download events
app.get('/api/download/events', (async (req: Request, res: Response): Promise<void> => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const downloadService = DownloadService.getInstance()

  // Helper function to send events
  const sendEvent = (event: string, data: DownloadTask | DownloadTask[] | null): void => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Send initial state
  const tasks = downloadService.getTasks()
  sendEvent('initialState', tasks)

  // Set up event listeners
  const eventHandlers = {
    [DownloadEvent.TASK_ADDED]: (task: DownloadTask) => sendEvent('taskAdded', task),
    [DownloadEvent.TASK_UPDATED]: (task: DownloadTask) => sendEvent('taskUpdated', task),
    [DownloadEvent.TASK_COMPLETED]: (task: DownloadTask) => sendEvent('taskCompleted', task),
    [DownloadEvent.TASK_ERROR]: (task: DownloadTask) => sendEvent('taskError', task),
    [DownloadEvent.QUEUE_PAUSED]: () => sendEvent('queuePaused', null),
    [DownloadEvent.QUEUE_RESUMED]: () => sendEvent('queueResumed', null),
    [DownloadEvent.QUEUE_CLEARED]: () => sendEvent('queueCleared', null)
  }

  // Add event listeners
  Object.entries(eventHandlers).forEach(([event, handler]) => {
    downloadService.on(event, handler)
  })

  // Handle client disconnect
  req.on('close', () => {
    // Remove event listeners
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      downloadService.removeListener(event, handler)
    })
  })
}) as RequestHandler)

// Download control endpoints
app.post('/api/download/pause', ((_req: Request, res: Response) => {
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

app.post('/api/download/resume', ((_req: Request, res: Response) => {
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

app.post('/api/download/stop', ((_req: Request, res: Response) => {
  try {
    const downloadService = DownloadService.getInstance()
    downloadService.clearQueue()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to stop download'
    })
  }
}) as RequestHandler)

// Mirror status endpoint
app.get('/api/mirrors/status', (async (_req: Request, res: Response) => {
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

export function startServer(): void {
  try {
    httpServer = app.listen(port, () => {
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
    httpServer.close(() => {
      console.log('API server stopped')
    })
  }
}
