import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { isValidExternalUrl, isSafeDirectoryToOpen, isSafePathToShow } from '../pathGuards'
import BeatmapMirrorService from '../../services/beatmapMirrorService'
import { logger } from '../../services/logger'

export function registerSystemIpc(mainWindow: BrowserWindow): () => void {
  const channels = [
    'system:select-directory',
    'system:select-backup-file',
    'system:open-path',
    'system:open-external',
    'system:show-item-in-folder',
    'system:get-mirrors-status',
    'system:open-log-folder',
    'system:get-diagnostic-info',
    'window:is-maximized'
  ]

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

  ipcMain.handle('system:select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    return result.canceled ? '' : result.filePaths[0]
  })

  ipcMain.handle('system:select-backup-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
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
      if (!isSafeDirectoryToOpen(targetPath)) {
        return 'Invalid or non-existent directory'
      }
      return await shell.openPath(path.resolve(targetPath.trim()))
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to open path'
    }
  })

  ipcMain.handle('system:open-external', async (_event, url: string) => {
    try {
      if (!isValidExternalUrl(url)) {
        console.warn('Blocked opening invalid/unsafe external URL:', url)
        return
      }
      await shell.openExternal(url)
    } catch (error) {
      console.error('Failed to open external url:', error)
    }
  })

  ipcMain.handle('system:show-item-in-folder', async (_event, targetPath: string) => {
    try {
      if (!isSafePathToShow(targetPath)) {
        console.warn('Blocked revealing invalid/non-existent path:', targetPath)
        return false
      }
      shell.showItemInFolder(path.resolve(targetPath.trim()))
      return true
    } catch (error) {
      console.error('Failed to show item in folder:', error)
      return false
    }
  })

  ipcMain.handle('system:get-mirrors-status', async () => {
    const mirrorService = BeatmapMirrorService.getInstance()
    return mirrorService.getMirrorsStatus()
  })

  ipcMain.handle('system:open-log-folder', async () => {
    try {
      const logDir = logger.getLogDir()
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      return await shell.openPath(logDir)
    } catch (error) {
      return error instanceof Error ? error.message : 'Failed to open log directory'
    }
  })

  ipcMain.handle('system:get-diagnostic-info', async () => {
    return logger.getDiagnosticSnapshot()
  })

  const onReportError = (
    _event: unknown,
    payload: { message: string; stack?: string; component?: string }
  ): void => {
    logger.error(
      `[RendererError${payload.component ? ` in ${payload.component}` : ''}] ${payload.message}`,
      payload.stack || ''
    )
  }
  ipcMain.on('system:report-renderer-error', onReportError)

  // Window Controls
  const onMinimize = (): void => {
    if (!mainWindow.isDestroyed()) mainWindow.minimize()
  }
  const onMaximize = (): void => {
    if (!mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  }
  const onClose = (): void => {
    if (!mainWindow.isDestroyed()) mainWindow.close()
  }

  ipcMain.on('window:minimize', onMinimize)
  ipcMain.on('window:maximize', onMaximize)
  ipcMain.on('window:close', onClose)
  ipcMain.handle('window:is-maximized', async () => {
    return !mainWindow.isDestroyed() && mainWindow.isMaximized()
  })

  const onWindowMaximizeEvent = (): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window:maximize-change', true)
  }
  const onWindowUnmaximizeEvent = (): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window:maximize-change', false)
  }
  mainWindow.on('maximize', onWindowMaximizeEvent)
  mainWindow.on('unmaximize', onWindowUnmaximizeEvent)

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
    ipcMain.removeListener('system:report-renderer-error', onReportError)
    ipcMain.removeListener('window:minimize', onMinimize)
    ipcMain.removeListener('window:maximize', onMaximize)
    ipcMain.removeListener('window:close', onClose)
    mainWindow.removeListener('maximize', onWindowMaximizeEvent)
    mainWindow.removeListener('unmaximize', onWindowUnmaximizeEvent)
  }
}
