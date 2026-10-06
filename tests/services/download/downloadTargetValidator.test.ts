import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  getDefaultDownloadPath,
  validateDownloadPath,
  validateBackupFile,
  getExistingBeatmapsetIds
} from '../../../src/services/download/downloadTargetValidator'

const mockHasSyncedData = vi.fn()
const mockGetExistingBeatmapsetIds = vi.fn()
const mockGetBeatmapsetIds = vi.fn()
const mockIsOsuProcessRunning = vi.fn()
const mockExecSync = vi.fn()

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    execSync: (...args: unknown[]) => mockExecSync(...args)
  }
})

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

const VALID_HEADER = `# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: 2026-01-01
# Total beatmaps: 3
# Source: test
`

describe('downloadTargetValidator', () => {
  describe('getDefaultDownloadPath', () => {
    it('returns custom path from Windows registry when query succeeds', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      mockExecSync.mockReturnValue(
        '    {374DE290-123F-4565-9164-39C4925E467B}    REG_EXPAND_SZ    D:\\MyDownloads'
      )

      try {
        const downloadPath = getDefaultDownloadPath()
        expect(downloadPath).toBe('D:\\MyDownloads')
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it('falls back to os.homedir()/Downloads when reg query throws', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      mockExecSync.mockImplementation(() => {
        throw new Error('Registry key not found')
      })

      try {
        const downloadPath = getDefaultDownloadPath()
        expect(downloadPath).toBe(path.join(os.homedir(), 'Downloads'))
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it('returns os.homedir()/Downloads on non-win32 platforms', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })

      try {
        const downloadPath = getDefaultDownloadPath()
        expect(downloadPath).toBe(path.join(os.homedir(), 'Downloads'))
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })
  })

  describe('validateDownloadPath', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'validator-test-'))
    })

    afterEach(async () => {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      } catch {
        // ignore
      }
    })

    it('accepts valid, existing, writable directory', async () => {
      await expect(validateDownloadPath(tempDir)).resolves.toBeUndefined()
    })

    it('throws when download path does not exist', async () => {
      const nonExistent = path.join(tempDir, 'non_existent_folder')
      await expect(validateDownloadPath(nonExistent)).rejects.toThrow(
        'Download path does not exist'
      )
    })

    it('throws when download path is a file instead of directory', async () => {
      const tempFile = path.join(tempDir, 'file.txt')
      await fs.promises.writeFile(tempFile, 'data')
      await expect(validateDownloadPath(tempFile)).rejects.toThrow(
        'Download path is not a directory'
      )
    })

    it('throws when directory has no write permission', async () => {
      const accessSpy = vi.spyOn(fs.promises, 'access').mockRejectedValue(new Error('EACCES'))
      try {
        await expect(validateDownloadPath(tempDir)).rejects.toThrow(
          'No write permission in download path'
        )
      } finally {
        accessSpy.mockRestore()
      }
    })
  })

  describe('validateBackupFile', () => {
    it('accepts valid backup content', () => {
      const content = `${VALID_HEADER}
123
456
789
`
      expect(() => validateBackupFile(content)).not.toThrow()
    })

    it('throws when header is missing', () => {
      expect(() => validateBackupFile('Invalid header content')).toThrow(
        'Invalid backup file format: Missing header'
      )
    })

    it('throws when required metadata is missing', () => {
      const missingSource = `# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: 2026-01-01
# Total beatmaps: 1
123
`
      expect(() => validateBackupFile(missingSource)).toThrow(/Missing # Source:/)
    })

    it('throws when no beatmapset IDs are present', () => {
      expect(() => validateBackupFile(VALID_HEADER)).toThrow('No beatmapset IDs found')
    })

    it('collects all invalid IDs and reports a summary counter', () => {
      const content = `${VALID_HEADER}
123
abc
45x
789
-1
`
      expect(() => validateBackupFile(content)).toThrow(
        /Invalid beatmapset IDs \(3\/5\): abc, 45x, -1/
      )
    })
  })

  describe('getExistingBeatmapsetIds', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockIsOsuProcessRunning.mockResolvedValue({ running: false })
    })

    it('uses SQLite database when data has been synced for stable and lazer', async () => {
      mockHasSyncedData.mockReturnValue(true)
      mockGetExistingBeatmapsetIds.mockReturnValue(new Set([101, 102, 201]))

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

    it('throws descriptive error if stable is running and database is not synced', async () => {
      mockHasSyncedData.mockReturnValue(false)
      mockIsOsuProcessRunning.mockResolvedValue({ running: true, client: 'stable' })

      await expect(
        getExistingBeatmapsetIds({
          removeFromStable: true,
          removeFromLazer: false,
          sources: ['kitsu'],
          noVideo: false,
          threadCount: 3
        })
      ).rejects.toThrow(/osu!stable is currently running/)
    })

    it('throws descriptive error if lazer is running and database is not synced', async () => {
      mockHasSyncedData.mockReturnValue(false)
      mockIsOsuProcessRunning.mockResolvedValue({ running: true, client: 'lazer' })

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
})
