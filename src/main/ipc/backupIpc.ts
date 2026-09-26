import { BrowserWindow, ipcMain } from 'electron'
import { collectionService } from '../../services/collection/collectionService'
import { exportService, type ExportOptions } from '../../services/exportService'
import type { PreviewCollectionOptions } from '../../preload/electronApiTypes'

export function registerBackupIpc(mainWindow: BrowserWindow): () => void {
  const channels = ['backup:preview-collections', 'backup:estimate', 'backup:export']

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

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

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
