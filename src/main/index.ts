import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../renderer/src/assets/logo.ico?asset'
import { startServer, stopServer } from '../services/api'
import { exportService } from '../services/exportService'
import fs from 'fs'
import { APP_NAME, APP_ID, WINDOW_CONFIG } from '../config/constants'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_CONFIG.DEFAULT_WIDTH,
    height: WINDOW_CONFIG.DEFAULT_HEIGHT,
    minWidth: WINDOW_CONFIG.MIN_WIDTH,
    minHeight: WINDOW_CONFIG.MIN_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  console.log('Window created with preload path:', join(__dirname, '../preload/index.js'))

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Open DevTools in development
    if (is.dev) {
      mainWindow.webContents.openDevTools()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId(APP_ID)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Register IPC handlers for electronAPI
  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? '' : result.filePaths[0]
  })

  ipcMain.handle('get-file-path', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Beatmap Backup Files', extensions: ['bbak'] }]
      })
      if (result.canceled) {
        throw new Error('No file selected')
      }
      return result.filePaths[0]
    } catch (error) {
      console.error('Error getting file path:', error)
      throw error
    }
  })

  ipcMain.handle('check-subdir', async (_, dir: string, sub: string) => {
    try {
      const subDirPath = join(dir, sub)
      return fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()
    } catch (error) {
      console.error('Error checking subdirectory:', error)
      return false
    }
  })

  ipcMain.handle('check-file', async (_, dir: string, file: string) => {
    try {
      const filePath = join(dir, file)
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    } catch (error) {
      console.error('Error checking file:', error)
      return false
    }
  })

  ipcMain.handle('export-data', async (_, options: { stable: boolean; lazer: boolean }) => {
    console.log('Export data handler called with options:', options)
    try {
      console.log('Calling exportService.exportData...')
      const result = await exportService.exportData(options)
      console.log('Export result:', result)
      return result
    } catch (error) {
      console.error('Export failed with error:', error)
      if (error instanceof Error) {
        console.error('Error name:', error.name)
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      return {
        success: false,
        count: 0,
        outputPath: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Open a file or directory path on host OS
  ipcMain.handle('open-path', async (_event, targetPath: string) => {
    try {
      const result = await shell.openPath(targetPath)
      // shell.openPath returns empty string on success, error message otherwise
      return result
    } catch (error) {
      console.error('Failed to open path:', error)
      return error instanceof Error ? error.message : 'Failed to open path'
    }
  })

  createWindow()
  startServer()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServer()
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
