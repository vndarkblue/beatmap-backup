import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExistsSync = vi.fn<(path: string) => boolean>()
const mockSchemaVersion = vi.fn<(path: string) => number>()
const mockOpen = vi.fn()

vi.mock('fs', () => ({
  default: {
    existsSync: (path: string) => mockExistsSync(path)
  }
}))

const mockGetOsuLazerPath = vi.fn(() => 'C:/osu')

vi.mock('../../src/services/settingsStore', () => ({
  getOsuLazerPath: () => mockGetOsuLazerPath(),
  getOsuLazerResolvedDataPath: () => null,
  setOsuLazerResolvedDataPath: () => {}
}))

vi.mock('realm', () => ({
  default: {
    schemaVersion: (path: string) => mockSchemaVersion(path),
    open: (config: unknown) => mockOpen(config)
  }
}))

describe('realmService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOsuLazerPath.mockReturnValue('C:/osu')
    mockExistsSync.mockImplementation((target) => target.endsWith('client.realm'))
    mockSchemaVersion.mockReturnValue(1)
  })

  it('tracks beatmapset id scan summary for accepted and skipped records', async () => {
    mockOpen.mockResolvedValue({
      schema: [{ name: 'BeatmapSet' }],
      objects: () => [{ OnlineID: 101 }, { OnlineID: 0 }, { OnlineID: 'bad' }],
      isClosed: false,
      close: vi.fn()
    })

    const { realmService } = await import('../../src/services/realmService')
    const ids = await realmService.getBeatmapsetIds()

    expect(ids).toEqual([101])
    expect(realmService.getLastBeatmapsetIdScanSummary()).toEqual({
      processed: 3,
      accepted: 1,
      skippedInvalidOnlineId: 2
    })
  })

  it('tracks beatmap database scan summary for skipped missing md5 rows', async () => {
    mockOpen.mockResolvedValue({
      schema: [{ name: 'Beatmap' }],
      objects: () => [
        { MD5Hash: '', OnlineID: 11, BeatmapSet: { OnlineID: 21 } },
        { MD5Hash: 'abc', OnlineID: 12, BeatmapSet: { OnlineID: 22 } }
      ],
      isClosed: false,
      close: vi.fn()
    })

    const { realmService } = await import('../../src/services/realmService')
    const rows = await realmService.getBeatmapsForDatabase()

    expect(rows).toHaveLength(1)
    expect(realmService.getLastBeatmapDatabaseScanSummary()).toEqual({
      processed: 2,
      accepted: 1,
      skippedMissingMd5: 1
    })
  })

  it('getRealmPath returns file path when client.realm exists', async () => {
    const { realmService } = await import('../../src/services/realmService')
    const realmPath = realmService.getRealmPath()
    expect(realmPath).toBeTruthy()
    expect(realmPath).toContain('client.realm')
  })

  it('getRealmPath returns null when osuLazerPath is not configured', async () => {
    mockGetOsuLazerPath.mockReturnValue('')
    const { realmService } = await import('../../src/services/realmService')
    const realmPath = realmService.getRealmPath()
    expect(realmPath).toBeNull()
  })

  it('getRealmPath returns null when client.realm file does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    const { realmService } = await import('../../src/services/realmService')
    const realmPath = realmService.getRealmPath()
    expect(realmPath).toBeNull()
  })
})
