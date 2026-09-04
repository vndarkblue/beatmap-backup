import { describe, expect, it } from 'vitest'
import {
  getDatabaseSourceStatus,
  canSyncDatabaseSource,
  type DatabaseSourceStatus
} from '../../src/renderer/src/utils/databaseStatus'

describe('databaseStatus utils', () => {
  describe('getDatabaseSourceStatus', () => {
    it('returns notConfigured when status is null and configuredPath is empty', () => {
      const result = getDatabaseSourceStatus(null, '')
      expect(result).toEqual({
        key: 'settings.database.notConfigured',
        colorClass: 'text-medium-emphasis'
      })
    })

    it('returns notConfigured when status.configured is false and path is empty', () => {
      const status: DatabaseSourceStatus = {
        configured: false,
        fileExists: false,
        lastSyncAt: null,
        lastFileMtime: null,
        currentFileMtime: null,
        beatmapCount: 0,
        isDirty: false
      }
      const result = getDatabaseSourceStatus(status, '')
      expect(result).toEqual({
        key: 'settings.database.notConfigured',
        colorClass: 'text-medium-emphasis'
      })
    })

    it('returns notFound when configured is true but fileExists is false', () => {
      const status: DatabaseSourceStatus = {
        configured: true,
        fileExists: false,
        lastSyncAt: null,
        lastFileMtime: null,
        currentFileMtime: null,
        beatmapCount: 0,
        isDirty: false
      }
      const result = getDatabaseSourceStatus(status, 'C:/osu')
      expect(result).toEqual({
        key: 'settings.database.notFound',
        colorClass: 'text-error'
      })
    })

    it('returns outOfDate when configured, fileExists, and isDirty is true', () => {
      const status: DatabaseSourceStatus = {
        configured: true,
        fileExists: true,
        lastSyncAt: null,
        lastFileMtime: null,
        currentFileMtime: 12345,
        beatmapCount: 0,
        isDirty: true
      }
      const result = getDatabaseSourceStatus(status, 'C:/osu')
      expect(result).toEqual({
        key: 'settings.database.outOfDate',
        colorClass: 'text-warning'
      })
    })

    it('returns upToDate when configured, fileExists, and isDirty is false', () => {
      const status: DatabaseSourceStatus = {
        configured: true,
        fileExists: true,
        lastSyncAt: 1600000000000,
        lastFileMtime: 12345,
        currentFileMtime: 12345,
        beatmapCount: 50,
        isDirty: false
      }
      const result = getDatabaseSourceStatus(status, 'C:/osu')
      expect(result).toEqual({
        key: 'settings.database.upToDate',
        colorClass: 'text-success'
      })
    })
  })

  describe('canSyncDatabaseSource', () => {
    it('returns false if not configured', () => {
      expect(canSyncDatabaseSource(null, '')).toBe(false)
      expect(
        canSyncDatabaseSource(
          {
            configured: false,
            fileExists: false,
            lastSyncAt: null,
            lastFileMtime: null,
            currentFileMtime: null,
            beatmapCount: 0,
            isDirty: false
          },
          ''
        )
      ).toBe(false)
    })

    it('returns false if configured but file does not exist', () => {
      expect(
        canSyncDatabaseSource(
          {
            configured: true,
            fileExists: false,
            lastSyncAt: null,
            lastFileMtime: null,
            currentFileMtime: null,
            beatmapCount: 0,
            isDirty: false
          },
          'C:/osu'
        )
      ).toBe(false)
    })

    it('returns true if configured and file exists', () => {
      expect(
        canSyncDatabaseSource(
          {
            configured: true,
            fileExists: true,
            lastSyncAt: null,
            lastFileMtime: null,
            currentFileMtime: null,
            beatmapCount: 0,
            isDirty: true
          },
          'C:/osu'
        )
      ).toBe(true)
    })
  })
})
