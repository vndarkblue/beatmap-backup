import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockGetMeta = vi.fn()
const mockSetMeta = vi.fn()
const mockGetCounts = vi.fn()
const mockGetBeatmapCountBySource = vi.fn()
const mockGetSchemaVersion = vi.fn()
const mockIsOsuProcessRunning = vi.fn()
const mockImportFromStableDb = vi.fn()
const mockImportFromLazerRealm = vi.fn()
const mockExistsSync = vi.fn()
const mockStatSync = vi.fn()

vi.mock('fs', () => ({
  default: {
    existsSync: (path: string) => mockExistsSync(path),
    statSync: (path: string) => mockStatSync(path)
  }
}))

vi.mock('../../../src/services/database/databaseService', () => ({
  DatabaseService: {
    getInstance: () => ({
      getMeta: (key: string) => mockGetMeta(key),
      setMeta: (key: string, val: string) => mockSetMeta(key, val),
      getCounts: () => mockGetCounts(),
      getBeatmapCountBySource: (source: string) => mockGetBeatmapCountBySource(source),
      getSchemaVersion: () => mockGetSchemaVersion()
    })
  }
}))

vi.mock('../../../src/services/database/stableImporter', () => ({
  getStableDbPath: () => 'C:/osu/osu!.db',
  importFromStableDb: () => mockImportFromStableDb()
}))

vi.mock('../../../src/services/database/lazerImporter', () => ({
  importFromLazerRealm: () => mockImportFromLazerRealm()
}))

vi.mock('../../../src/services/realmService', () => ({
  realmService: {
    getRealmPath: () => 'C:/osu-lazer/client.realm'
  }
}))

vi.mock('../../../src/services/settingsStore', () => ({
  getOsuStablePath: () => 'C:/osu',
  getOsuLazerPath: () => 'C:/osu-lazer'
}))

vi.mock('../../../src/services/processDetector', () => ({
  isOsuProcessRunning: (source: string) => mockIsOsuProcessRunning(source)
}))

describe('SyncManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockStatSync.mockReturnValue({ mtimeMs: 12345 })
    mockGetCounts.mockReturnValue({ beatmapsets: 10, beatmaps: 20 })
    mockGetBeatmapCountBySource.mockReturnValue(10)
    mockGetSchemaVersion.mockReturnValue(1)
    mockIsOsuProcessRunning.mockResolvedValue({ running: false })
    mockImportFromStableDb.mockResolvedValue({ beatmapsets: 5, beatmaps: 10 })
    mockImportFromLazerRealm.mockResolvedValue({ beatmapsets: 5, beatmaps: 10 })
  })

  it('getStatus determines lazer dirty state without depending on mtime', async () => {
    mockGetMeta.mockImplementation((key: string) => {
      if (key === 'last_sync_lazer_at') return '1600000000000'
      if (key === 'last_sync_lazer_mtime') return '10000'
      return null
    })

    const { default: SyncManager } = await import('../../../src/services/database/syncManager')
    const syncManager = SyncManager.getInstance()
    const status = syncManager.getStatus()

    // Even if currentMtime (12345) !== lastMtime (10000), lazer isDirty should be false because it was already synced
    expect(status.lazer.isDirty).toBe(false)
  })

  it('skips startup sync when osu!stable process is running', async () => {
    mockIsOsuProcessRunning.mockImplementation((source: string) => {
      if (source === 'stable') return Promise.resolve({ running: true, client: 'stable' })
      return Promise.resolve({ running: false })
    })

    mockGetMeta.mockImplementation((key: string) => {
      if (key === 'last_sync_lazer_at') return '1600000000000'
      return null
    })

    const { default: SyncManager } = await import('../../../src/services/database/syncManager')
    const syncManager = SyncManager.getInstance()

    const events: Array<{ source?: string; phase?: string }> = []
    const listener = (e: { source?: string; phase?: string }): void => {
      events.push(e)
    }
    syncManager.on('sync', listener)

    await syncManager.runStartupSync()

    syncManager.off('sync', listener)
    expect(mockImportFromStableDb).not.toHaveBeenCalled()
    expect(events.some((e) => e.source === 'stable' && e.phase === 'skipped')).toBe(true)
  })

  it('emits error during manual sync when game process is running', async () => {
    mockIsOsuProcessRunning.mockResolvedValue({ running: true, client: 'lazer' })

    const { default: SyncManager } = await import('../../../src/services/database/syncManager')
    const syncManager = SyncManager.getInstance()

    const events: Array<{ source?: string; phase?: string }> = []
    const listener = (e: { source?: string; phase?: string }): void => {
      events.push(e)
    }
    syncManager.on('sync', listener)

    await syncManager.runManualSync('lazer', true)

    syncManager.off('sync', listener)
    expect(mockImportFromLazerRealm).not.toHaveBeenCalled()
    expect(events.some((e) => e.source === 'lazer' && e.phase === 'error')).toBe(true)
  })

  it('runs lazer sync during startup even if already synced before when lazer is not running', async () => {
    mockIsOsuProcessRunning.mockResolvedValue({ running: false })
    mockGetMeta.mockImplementation((key: string) => {
      if (key === 'last_sync_lazer_at') return '1600000000000'
      if (key === 'last_sync_stable_mtime') return '12345'
      return null
    })

    const { default: SyncManager } = await import('../../../src/services/database/syncManager')
    const syncManager = SyncManager.getInstance()

    await syncManager.runStartupSync()

    // Stable skipped because mtime unchanged (12345 === 12345)
    expect(mockImportFromStableDb).not.toHaveBeenCalled()
    // Lazer should run and not be blocked by previous sync
    expect(mockImportFromLazerRealm).toHaveBeenCalled()
    expect(mockIsOsuProcessRunning).toHaveBeenCalledTimes(2)
    expect(mockIsOsuProcessRunning).toHaveBeenNthCalledWith(1, 'stable')
    expect(mockIsOsuProcessRunning).toHaveBeenNthCalledWith(2, 'lazer')
  })

  it('skips lazer startup sync when osu!lazer is currently running', async () => {
    mockIsOsuProcessRunning.mockImplementation((source: string) => {
      if (source === 'lazer') return Promise.resolve({ running: true, client: 'lazer' })
      return Promise.resolve({ running: false })
    })

    const { default: SyncManager } = await import('../../../src/services/database/syncManager')
    const syncManager = SyncManager.getInstance()

    const events: Array<{ source?: string; phase?: string }> = []
    const listener = (e: { source?: string; phase?: string }): void => {
      events.push(e)
    }
    syncManager.on('sync', listener)

    await syncManager.runStartupSync()

    syncManager.off('sync', listener)
    expect(mockImportFromLazerRealm).not.toHaveBeenCalled()
    expect(events.some((e) => e.source === 'lazer' && e.phase === 'skipped')).toBe(true)
  })

  it('handles startBackgroundSync and stopBackgroundSync correctly', async () => {
    vi.useFakeTimers()
    const { default: SyncManager } = await import('../../../src/services/database/syncManager')
    const syncManager = SyncManager.getInstance()

    syncManager.startBackgroundSync(1000)
    expect(mockImportFromLazerRealm).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(mockImportFromLazerRealm).toHaveBeenCalled()

    syncManager.stopBackgroundSync()
    vi.useRealTimers()
  })
})
