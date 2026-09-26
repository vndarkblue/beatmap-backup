import { BrowserWindow, dialog, ipcMain } from 'electron'
import updateService from '../../services/updateService'

export function registerUpdaterIpc(mainWindow: BrowserWindow): () => void {
  const channels = [
    'updater:get-app-version',
    'updater:get-distribution-type',
    'updater:get-last-result',
    'updater:get-update-state',
    'updater:check',
    'updater:download',
    'updater:open-release',
    'updater:download-linux-appimage',
    'updater:show-install-confirm'
  ]

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

  ipcMain.handle('updater:get-app-version', async () => {
    return updateService.getAppVersion()
  })

  ipcMain.handle('updater:get-distribution-type', async () => {
    return updateService.getDistributionType()
  })

  ipcMain.handle('updater:get-last-result', async () => {
    return updateService.getLastCheckResult()
  })

  ipcMain.handle('updater:get-update-state', async () => {
    return updateService.getUpdateState()
  })

  ipcMain.handle('updater:check', async () => {
    return updateService.checkForUpdates()
  })

  ipcMain.handle('updater:download', async () => {
    return updateService.downloadUpdate()
  })

  const onInstallUpdate = (): void => {
    updateService.installUpdate()
  }
  ipcMain.on('updater:install', onInstallUpdate)

  ipcMain.handle('updater:open-release', async (_event, version?: string) => {
    return updateService.openReleasePage(version)
  })

  ipcMain.handle('updater:download-linux-appimage', async (_event, version?: string) => {
    return updateService.downloadLinuxAppImage(version)
  })

  ipcMain.handle(
    'updater:show-install-confirm',
    async (
      _event,
      options: {
        title: string
        message: string
        detail?: string
        confirmLabel: string
        cancelLabel: string
      }
    ) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: options.title,
        message: options.message,
        detail: options.detail,
        buttons: [options.confirmLabel, options.cancelLabel],
        defaultId: 0,
        cancelId: 1
      })
      return result.response === 0
    }
  )

  const unsubscribeUpdater = updateService.addListener((event) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:push-event', event)
    }
  })

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
    ipcMain.removeListener('updater:install', onInstallUpdate)
    unsubscribeUpdater()
  }
}
