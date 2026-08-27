import BeatmapMirrorService from '../services/beatmapMirrorService'
import DownloadService from '../services/downloadService'
import SyncManager from '../services/database/syncManager'
import CollectionSyncService from '../services/collection/collectionSyncService'
import { runStartupAutoDetect } from '../services/startupAutoDetect'
import { setStartupAutoDetectResult } from './ipc/registerIpcHandlers'
import { startupMark } from '../services/startupTrace'

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

export function startDeferredBackgroundServices(): void {
  try {
    startupMark('backgroundServices:start')

    const mirrorService = BeatmapMirrorService.getInstance()
    mirrorService.startBackgroundHealthChecks()

    const downloadService = DownloadService.getInstance()
    void downloadService.preloadRecoveryState()

    const syncManager = SyncManager.getInstance()
    void syncManager.runStartupSync()

    const collectionSyncService = CollectionSyncService.getInstance()
    collectionSyncService.startBackgroundSync()

    startupMark('backgroundServices:ready')
  } catch (error) {
    console.error('Failed to start deferred background services:', error)
  }
}

export function startBackgroundServices(): void {
  initEarlyServices()
  startDeferredBackgroundServices()
}

export async function stopBackgroundServices(): Promise<void> {
  try {
    const mirrorService = BeatmapMirrorService.getInstance()
    mirrorService.stopBackgroundHealthChecks()

    const collectionSyncService = CollectionSyncService.getInstance()
    collectionSyncService.stopBackgroundSync()

    const downloadService = DownloadService.getInstance()
    await downloadService.flushCheckpointWithTimeout()
  } catch (error) {
    console.error('Error stopping background services:', error)
  }
}
