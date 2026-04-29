import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetOsuStablePath = vi.fn<() => string | null>()
const mockExistsSync = vi.fn<(path: string) => boolean>()
const mockReaddirSync = vi.fn<(path: string) => string[]>()
const mockWriteFileSync = vi.fn()
const mockGetBeatmapsetIds = vi.fn<() => Promise<number[]>>()
const mockShowSaveDialog = vi.fn()

vi.mock('../../src/services/settingsStore', () => ({
  getOsuStablePath: () => mockGetOsuStablePath()
}))

vi.mock('fs', () => ({
  default: {
    existsSync: (path: string) => mockExistsSync(path),
    readdirSync: (path: string) => mockReaddirSync(path),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args)
  }
}))

vi.mock('../../src/services/realmService', () => ({
  realmService: {
    getBeatmapsetIds: () => mockGetBeatmapsetIds()
  }
}))

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args)
  }
}))

vi.mock('../../src/services/collection/collectionService', () => ({
  collectionService: {
    resolveCollectionBeatmapsetIds: vi.fn()
  }
}))

describe('exportService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOsuStablePath.mockReturnValue('C:/osu')
    mockExistsSync.mockReturnValue(true)
    mockGetBeatmapsetIds.mockResolvedValue([])
  })

  it('tracks folder scan summary for estimate with skipped invalid names', async () => {
    mockReaddirSync.mockReturnValue(['123 good', 'invalid', '456 another', 'x 789'])
    const { exportService } = await import('../../src/services/exportService')

    const result = await exportService.estimateExportData({
      stable: true,
      lazer: false
    })

    expect(result.count).toBe(2)
    expect(exportService.getLastStableFolderScanSummary()).toEqual({
      processedFolders: 4,
      matchedIds: 2,
      skippedInvalidNames: 2
    })
  })

  it('reuses scan summary path during export and dedupes stable+lazer ids', async () => {
    mockReaddirSync.mockReturnValue(['100 a', '200 b'])
    mockGetBeatmapsetIds.mockResolvedValue([200, 300])
    mockShowSaveDialog.mockResolvedValue({ filePath: 'C:/out.bbak' })
    const { exportService } = await import('../../src/services/exportService')

    const result = await exportService.exportData({
      stable: true,
      lazer: true
    })

    expect(result.success).toBe(true)
    expect(result.count).toBe(3)
    expect(exportService.getLastStableFolderScanSummary()).toEqual({
      processedFolders: 2,
      matchedIds: 2,
      skippedInvalidNames: 0
    })
  })
})
