import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockHasSyncedData = vi.fn()
const mockGetExistingBeatmapsetIds = vi.fn()
const mockGetBeatmapsetIds = vi.fn()
const mockIsOsuProcessRunning = vi.fn()

vi.mock('../../../src/services/database/databaseService', () => ({
  DatabaseService: {
    getInstance: () => ({
      hasSyncedData: (source: string) => mockHasSyncedData(source),
      getExistingBeatmapsetIds: (sources: unknown) => mockGetExistingBeatmapsetIds(sources)
    })
  }
}))

vi.mock('../../../src/services/realmService', () => ({
  realmService: {
    getBeatmapsetIds: () => mockGetBeatmapsetIds()
  }
}))

vi.mock('../../../src/services/settingsStore', () => ({
  getOsuStablePath: () => 'C:/osu',
  getOsuLazerPath: () => 'C:/osu-lazer'
}))

vi.mock('../../../src/services/processDetector', () => ({
  isOsuProcessRunning: () => mockIsOsuProcessRunning()
}))

describe('getExistingBeatmapsetIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsOsuProcessRunning.mockResolvedValue({ running: false })
  })

  it('uses SQLite database when data has been synced for stable and lazer', async () => {
    mockHasSyncedData.mockReturnValue(true)
    mockGetExistingBeatmapsetIds.mockReturnValue(new Set([101, 102, 201]))

    const { getExistingBeatmapsetIds } = await import('../../../src/services/download/fileUtils')

    const result = await getExistingBeatmapsetIds({
      removeFromStable: true,
      removeFromLazer: true,
      sources: ['kitsu'],
      noVideo: false,
      threadCount: 3
    })

    expect(result.has(101)).toBe(true)
    expect(result.has(102)).toBe(true)
    expect(result.has(201)).toBe(true)
    expect(result.size).toBe(3)
  })

  it('throws descriptive error if lazer is running and database is not synced', async () => {
    mockHasSyncedData.mockReturnValue(false)
    mockIsOsuProcessRunning.mockResolvedValue({ running: true, client: 'lazer' })

    const { getExistingBeatmapsetIds } = await import('../../../src/services/download/fileUtils')

    await expect(
      getExistingBeatmapsetIds({
        removeFromStable: false,
        removeFromLazer: true,
        sources: ['kitsu'],
        noVideo: false,
        threadCount: 3
      })
    ).rejects.toThrow(/osu!lazer is currently running/)
  })

  it('throws descriptive error if realmService fails instead of returning empty set', async () => {
    mockHasSyncedData.mockReturnValue(false)
    mockIsOsuProcessRunning.mockResolvedValue({ running: false })
    mockGetBeatmapsetIds.mockRejectedValue(new Error('Realm file is locked'))

    const { getExistingBeatmapsetIds } = await import('../../../src/services/download/fileUtils')

    await expect(
      getExistingBeatmapsetIds({
        removeFromStable: false,
        removeFromLazer: true,
        sources: ['kitsu'],
        noVideo: false,
        threadCount: 3
      })
    ).rejects.toThrow(/Failed to read existing maps from osu!lazer/)
  })
})
