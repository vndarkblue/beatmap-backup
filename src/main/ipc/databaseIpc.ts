import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import SyncManager from '../../services/database/syncManager'
import { DatabaseService } from '../../services/database/databaseService'
import CollectionSyncService from '../../services/collection/collectionSyncService'

export function registerDatabaseIpc(mainWindow: BrowserWindow): () => void {
  const channels = [
    'database:get-status',
    'database:sync',
    'database:sync-collections',
    'database:get-collection-status',
    'database:filter-beatmaps',
    'database:export-filtered-backup'
  ]

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

  const syncManager = SyncManager.getInstance()
  const collectionSync = CollectionSyncService.getInstance()
  const db = DatabaseService.getInstance()

  ipcMain.handle('database:get-status', async () => {
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
      void syncManager.runManualSync(source, force)
      return { success: true }
    }
  )

  ipcMain.handle('database:sync-collections', async () => {
    const result = await collectionSync.requestManualSync()
    return {
      success: true,
      ...result,
      status: collectionSync.getStatus()
    }
  })

  ipcMain.handle('database:get-collection-status', async () => {
    return collectionSync.getStatus()
  })

  ipcMain.handle('database:filter-beatmaps', async (_event, filter: Record<string, unknown>) => {
    return db.filterBeatmaps(filter)
  })

  ipcMain.handle(
    'database:export-filtered-backup',
    async (_event, filter: Record<string, unknown>) => {
      const ids = db.getFilteredBeatmapsetIds(filter)
      if (ids.length === 0) {
        return { success: false, error: 'No beatmaps to export' }
      }
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Filtered Beatmaps',
        defaultPath: `osu-filtered-beatmaps-${new Date().toISOString().slice(0, 10)}.bbak`,
        filters: [{ name: 'Beatmap Backup Files', extensions: ['bbak', 'txt'] }]
      })
      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, error: 'cancelled' }
      }
      const content = [
        '# osu! beatmap backup file (Filtered)',
        `# Exported: ${new Date().toISOString()}`,
        `# Total Beatmapsets: ${ids.length}`,
        ...ids
      ].join('\n')
      await fs.promises.writeFile(saveResult.filePath, `${content}\n`, 'utf-8')
      return { success: true, count: ids.length, filePath: saveResult.filePath }
    }
  )

  const onSyncEvent = (event: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('database:sync-progress', event)
    }
  }

  syncManager.on('sync', onSyncEvent)

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
    syncManager.removeListener('sync', onSyncEvent)
  }
}
