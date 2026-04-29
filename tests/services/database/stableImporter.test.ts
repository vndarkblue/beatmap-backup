import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExistsSync = vi.fn<(path: string) => boolean>()
const mockReadFileSync = vi.fn()
const mockGetOsuStablePath = vi.fn<() => string | null>()
const mockGetOsuDbData = vi.fn()
const mockUpsertBatch = vi.fn()

vi.mock('fs', () => ({
  default: {
    existsSync: (path: string) => mockExistsSync(path),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args)
  }
}))

vi.mock('../../../src/services/settingsStore', () => ({
  getOsuStablePath: () => mockGetOsuStablePath()
}))

vi.mock('osu-db-parser', () => ({
  OsuDBParser: class {
    getOsuDBData(): unknown {
      return mockGetOsuDbData()
    }
  }
}))

vi.mock('../../../src/services/database/databaseService', () => ({
  DatabaseService: {
    getInstance: () => ({
      upsertBatch: (...args: unknown[]) => mockUpsertBatch(...args)
    })
  }
}))

describe('importFromStableDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOsuStablePath.mockReturnValue('C:/osu')
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(Buffer.from('fake'))
  })

  it('tracks processed/accepted/skipped summary for invalid stable rows', async () => {
    mockGetOsuDbData.mockReturnValue({
      beatmaps: [
        { md5: '', beatmapset_id: 12 },
        { md5: 'abc', beatmapset_id: 0 },
        { md5: 'def', beatmapset_id: 15, mode: 0 }
      ]
    })

    const { getLastStableImportSummary, importFromStableDb } = await import(
      '../../../src/services/database/stableImporter'
    )
    const result = await importFromStableDb()
    expect(result.beatmaps).toBe(1)
    expect(getLastStableImportSummary()).toEqual({
      processed: 3,
      accepted: 1,
      skippedMissingMd5: 1,
      skippedInvalidBeatmapsetId: 1
    })
  })
})
