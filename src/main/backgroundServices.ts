import { runStartupAutoDetect } from '../services/startupAutoDetect'
import { setStartupAutoDetectResult } from './ipc/registerIpcHandlers'
import { startupMark } from '../services/logger'

export function initEarlyServices(): void {
  try {
    startupMark('earlyServices:start')
    const autoDetectResult = runStartupAutoDetect()
    setStartupAutoDetectResult(autoDetectResult)
    startupMark('earlyServices:ready')
  } catch (error) {
    console.error('Failed to run early services:', error)
  }
}

export async function startDeferredBackgroundServices(): Promise<void> {
  try {
    startupMark('backgroundServices:start')

    const [
      { default: DownloadService },
      { default: SyncManager },
      { default: CollectionSyncService },
      { default: updateService },
      { default: TelemetryService }
    ] = await Promise.all([
      import('../services/downloadService'),
      import('../services/database/syncManager'),
      import('../services/collection/collectionSyncService'),
      import('../services/updateService'),
      import('../services/telemetryService')
    ])

    const downloadService = DownloadService.getInstance()
    void downloadService.preloadRecoveryState()

    const syncManager = SyncManager.getInstance()
    void syncManager.runStartupSync()
    syncManager.startBackgroundSync()

    const collectionSyncService = CollectionSyncService.getInstance()
    collectionSyncService.startBackgroundSync()

    updateService.checkOnStartup()

    const telemetryService = TelemetryService.getInstance()
    telemetryService.init()

    startupMark('backgroundServices:ready')
  } catch (error) {
    console.error('Failed to start deferred background services:', error)
  }
}

export function startBackgroundServices(): void {
  initEarlyServices()
  void startDeferredBackgroundServices()
}

export async function stopBackgroundServices(): Promise<void> {
  try {
    const [
      { default: SyncManager },
      { default: CollectionSyncService },
      { default: DownloadService },
      { default: TelemetryService }
    ] = await Promise.all([
      import('../services/database/syncManager'),
      import('../services/collection/collectionSyncService'),
      import('../services/downloadService'),
      import('../services/telemetryService')
    ])

    const syncManager = SyncManager.getInstance()
    syncManager.stopBackgroundSync()

    const collectionSyncService = CollectionSyncService.getInstance()
    collectionSyncService.stopBackgroundSync()

    const downloadService = DownloadService.getInstance()
    await downloadService.flushCheckpointWithTimeout()

    const telemetryService = TelemetryService.getInstance()
    telemetryService.stop()
    await telemetryService.flush()
  } catch (error) {
    console.error('Error stopping background services:', error)
  }
}
