import { app, shell, BrowserWindow } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../renderer/src/assets/logo.ico?asset'
import { APP_NAME, APP_ID } from '../config/sharedConstants'
import { WINDOW_CONFIG } from '../config/backendConstants'
import { startupMark } from '../services/startupTrace'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import {
  initEarlyServices,
  startDeferredBackgroundServices,
  stopBackgroundServices
} from './backgroundServices'
import SyncManager from '../services/database/syncManager'

let cleanupIpcHandlers: (() => void) | undefined

function createWindow(): BrowserWindow {
  startupMark('createWindow:start')
  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_CONFIG.DEFAULT_WIDTH,
    height: WINDOW_CONFIG.DEFAULT_HEIGHT,
    minWidth: WINDOW_CONFIG.MIN_WIDTH,
    minHeight: WINDOW_CONFIG.MIN_HEIGHT,
    show: false,
    backgroundColor: '#fafafa',
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  let backgroundStarted = false
  const scheduleDeferredTasks = (): void => {
    if (backgroundStarted) return
    backgroundStarted = true
    startupMark('startupTasks:scheduled')
    setTimeout(() => {
      startDeferredBackgroundServices()
    }, 1500)
  }

  mainWindow.once('ready-to-show', () => {
    startupMark('window:ready-to-show')
    mainWindow.show()
    if (is.dev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
    scheduleDeferredTasks()
  })

  // Fallback to guarantee window visibility even if ready-to-show is delayed
  setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
    scheduleDeferredTasks()
  }, 1000)

  mainWindow.webContents.on('dom-ready', () => {
    startupMark('window:dom-ready')
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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

  // Quick synchronous early services (e.g. auto detect paths)
  initEarlyServices()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    void stopBackgroundServices().finally(() => {
      app.quit()
    })
  }
})
