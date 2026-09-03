import type { DatabaseStatus } from '../../../services/database/types'

export type DatabaseSourceStatus = DatabaseStatus['stable']

export interface SourceStatusDisplay {
  key: string
  colorClass: string
}

/**
 * Determines the display label (i18n key) and styling class for a database source (stable or lazer).
 */
export function getDatabaseSourceStatus(
  status: DatabaseSourceStatus | null | undefined,
  configuredPath?: string | null
): SourceStatusDisplay {
  const isConfigured = Boolean(status ? status.configured : configuredPath)

  if (!isConfigured) {
    return {
      key: 'settings.database.notConfigured',
      colorClass: 'text-medium-emphasis'
    }
  }

  if (status && !status.fileExists) {
    return {
      key: 'settings.database.notFound',
      colorClass: 'text-error'
    }
  }

  if (status?.isDirty) {
    return {
      key: 'settings.database.outOfDate',
      colorClass: 'text-warning'
    }
  }

  return {
    key: 'settings.database.upToDate',
    colorClass: 'text-success'
  }
}

/**
 * Determines if a source is ready and able to be synced.
 */
export function canSyncDatabaseSource(
  status: DatabaseSourceStatus | null | undefined,
  configuredPath?: string | null
): boolean {
  const isConfigured = Boolean(status ? status.configured : configuredPath)
  if (!isConfigured) return false
  return status ? status.fileExists : true
}
