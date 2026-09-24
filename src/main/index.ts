import './initPortable'
import { logger } from '../services/logger'
logger.init()

import { app, shell, BrowserWindow } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../renderer/src/assets/logo.ico?asset'
import { APP_NAME, APP_ID } from '../config/sharedConstants'
import { WINDOW_CONFIG } from '../config/backendConstants'
import { restoreWindowState, manageWindowState } from './windowState'
import { startupMark } from '../services/startupTrace'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import {
  initEarlyServices,
  startDeferredBackgroundServices,
  stopBackgroundServices
} from './backgroundServices'
import SyncManager from '../services/database/syncManager'

// Suppress noisy Chromium-internal DevTools protocol logs (e.g. unsupported Autofill CDP domain in Electron)
if (is.dev) {
  app.commandLine.appendSwitch('log-level', '3')

  const originalStderrWrite = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((err?: Error) => void),
    callback?: (err?: Error) => void
  ): boolean => {
    const str = typeof chunk === 'string' ? chunk : chunk?.toString?.() || ''
    if (str.includes('Autofill.enable') || str.includes('Autofill.setAddresses')) {
      const cb = typeof encoding === 'function' ? encoding : callback
      cb?.()
      return true
    }
    return (originalStderrWrite as (...args: unknown[]) => boolean)(chunk, encoding, callback)
  }) as typeof process.stderr.write
}

let cleanupIpcHandlers: (() => void) | undefined
let cleanupWindowState: (() => void) | undefined

function createWindow(): BrowserWindow {
  startupMark('createWindow:start')
  const windowState = restoreWindowState()

  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: WINDOW_CONFIG.MIN_WIDTH,
    minHeight: WINDOW_CONFIG.MIN_HEIGHT,
    show: false,
    backgroundColor: '#fafafa',
    autoHideMenuBar: true,
    frame: false,
    icon: icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  cleanupWindowState = manageWindowState(mainWindow, windowState)

  let backgroundStarted = false
  const scheduleDeferredTasks = (): void => {
    if (backgroundStarted) return
    backgroundStarted = true
    startupMark('startupTasks:scheduled')
    setTimeout(() => {
      startDeferredBackgroundServices()
    }, 1500)
  }

  // Fallback to guarantee window visibility even if ready-to-show is delayed
  const fallbackDelay = is.dev ? 5000 : 3000
  const fallbackTimer = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      if (windowState.isMaximized) {
        mainWindow.maximize()
      }
      mainWindow.show()
      scheduleDeferredTasks()
    }
  }, fallbackDelay)

  mainWindow.once('ready-to-show', () => {
    clearTimeout(fallbackTimer)
    startupMark('window:ready-to-show')
    if (windowState.isMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
    if (is.dev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
    scheduleDeferredTasks()
  })

  mainWindow.webContents.on('dom-ready', () => {
    startupMark('window:dom-ready')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    startupMark('window:loadURL', { url: process.env['ELECTRON_RENDERER_URL'] })
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    startupMark('window:loadFile')
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Register domain-driven IPC handlers and event dispatchers
  cleanupIpcHandlers = registerIpcHandlers(mainWindow)

  mainWindow.on('focus', () => {
    SyncManager.getInstance().handleWindowFocus()
  })

  mainWindow.on('closed', () => {
    if (cleanupWindowState) {
      cleanupWindowState()
      cleanupWindowState = undefined
    }
    if (cleanupIpcHandlers) {
      cleanupIpcHandlers()
      cleanupIpcHandlers = undefined
    }
  })

  startupMark('createWindow:end')
  return mainWindow
}

app.whenReady().then(() => {
  startupMark('app:whenReady')
  electronApp.setAppUserModelId(APP_ID)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Create window immediately so navigation starts without waiting
  createWindow()

  // Run early services (e.g. auto detect paths) concurrently with initial page load
  initEarlyServices()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

let shutdownPromise: Promise<void> | null = null

function ensureShutdownServices(): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = stopBackgroundServices()
  }
  return shutdownPromise
}

app.on('before-quit', () => {
  void ensureShutdownServices()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void ensureShutdownServices().finally(() => {
      app.quit()
    })
  }
})
