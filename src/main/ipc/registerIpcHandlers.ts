import { BrowserWindow } from 'electron'
import { registerSettingsIpc, setStartupAutoDetectResult } from './settingsIpc'
import { registerDownloadIpc } from './downloadIpc'
import { registerDatabaseIpc } from './databaseIpc'
import { registerBackupIpc } from './backupIpc'
import { registerSystemIpc } from './systemIpc'
import { registerUpdaterIpc } from './updaterIpc'

export { setStartupAutoDetectResult }

export function registerIpcHandlers(mainWindow: BrowserWindow): () => void {
  const unregisterSettings = registerSettingsIpc()
  const unregisterDownload = registerDownloadIpc(mainWindow)
  const unregisterDatabase = registerDatabaseIpc(mainWindow)
  const unregisterBackup = registerBackupIpc(mainWindow)
  const unregisterSystem = registerSystemIpc(mainWindow)
  const unregisterUpdater = registerUpdaterIpc(mainWindow)

  return () => {
    unregisterSettings()
    unregisterDownload()
    unregisterDatabase()
    unregisterBackup()
    unregisterSystem()
    unregisterUpdater()
  }
}
