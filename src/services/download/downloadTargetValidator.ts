import path from 'path'
import fs from 'fs'
import os from 'os'
import { execSync } from 'child_process'
import { getOsuStablePath, getOsuLazerPath } from '../settingsStore'
import { getStableSongsPath } from '../pathAutoDetect'
import { realmService } from '../realmService'
import { DatabaseService } from '../database/databaseService'
import { getStableDbPath } from '../database/stableImporter'
import { isOsuProcessRunning } from '../processDetector'
import { OsuDBParser } from 'osu-db-parser'
import type { DownloadOptions } from './types'

export function getDefaultDownloadPath(): string {
  const platform = process.platform
  const homeDir = os.homedir()

  switch (platform) {
    case 'win32':
      try {
        const command =
          'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders" /v "{374DE290-123F-4565-9164-39C4925E467B}"'
        const output = execSync(command, { encoding: 'utf-8' })
        const match = output.match(/REG_EXPAND_SZ\s+(.+)$/)
        if (match) {
          return match[1].replace(/%([^%]+)%/g, (_, n) => process.env[n] || '')
        }
      } catch {
        // Fall through to default
      }
      return path.join(homeDir, 'Downloads')
    default:
      return path.join(homeDir, 'Downloads')
  }
}

export async function validateDownloadPath(downloadPath: string): Promise<void> {
  if (!fs.existsSync(downloadPath)) {
    throw new Error('Download path does not exist')
  }

  const stats = await fs.promises.stat(downloadPath)
  if (!stats.isDirectory()) {
    throw new Error('Download path is not a directory')
  }

  try {
    await fs.promises.access(downloadPath, fs.constants.W_OK)
  } catch {
    throw new Error('No write permission in download path')
  }
}

export function validateBackupFile(content: string): void {
  if (!content.startsWith('# Beatmap Backup File')) {
    throw new Error('Invalid backup file format: Missing header')
  }

  const requiredMetadata = [
    '# Format: One beatmapset ID per line',
    '# Created:',
    '# Total beatmaps:',
    '# Source:'
  ]

  for (const metadata of requiredMetadata) {
    if (!content.includes(metadata)) {
      throw new Error(`Invalid backup file format: Missing ${metadata}`)
    }
  }

  const lines = content.split('\n')
  const ids = lines.filter((line) => line.trim() && !line.startsWith('#'))

  if (ids.length === 0) {
    throw new Error('Invalid backup file: No beatmapset IDs found')
  }

  const invalidIds = ids.map((id) => id.trim()).filter((id) => !/^\d+$/.test(id))

  if (invalidIds.length > 0) {
    throw new Error(
      `Invalid beatmapset IDs (${invalidIds.length}/${ids.length}): ${invalidIds.join(', ')}`
    )
  }
}

export async function getExistingBeatmapsetIds(options: DownloadOptions): Promise<Set<number>> {
  const existingIds = new Set<number>()
  const db = DatabaseService.getInstance()

  if (options.removeFromStable) {
    if (db.hasSyncedData('stable')) {
      const stableIds = db.getExistingBeatmapsetIds({ stable: true })
      for (const id of stableIds) {
        existingIds.add(id)
      }
    } else {
      // Fallback to direct reading if SQLite has not synced stable beatmaps yet
      try {
        const osuStablePath = getOsuStablePath()
        if (!osuStablePath) {
          throw new Error('osu!stable path is not configured in Settings.')
        }
        const stableDbPath = getStableDbPath()
        if (stableDbPath && fs.existsSync(stableDbPath)) {
          const buffer = fs.readFileSync(stableDbPath)
          const parser = new OsuDBParser(buffer, null)
          const data = parser.getOsuDBData() as {
            beatmaps?: Array<{ beatmapset_id?: number }>
          } | null
          const beatmaps = data?.beatmaps ?? []
          for (const bm of beatmaps) {
            if (bm.beatmapset_id && bm.beatmapset_id > 0) {
              existingIds.add(bm.beatmapset_id)
            }
          }
        } else {
          const songsPath = getStableSongsPath(osuStablePath)
          if (fs.existsSync(songsPath)) {
            const folders = fs.readdirSync(songsPath)
            for (const folder of folders) {
              const match = folder.match(/^(\d+)\s/)
              if (match) {
                const id = parseInt(match[1])
                if (!isNaN(id)) existingIds.add(id)
              }
            }
          } else {
            throw new Error('Neither osu!.db nor Songs folder was found in osu!stable path.')
          }
        }
      } catch (error) {
        throw new Error(
          `Failed to read existing maps from osu!stable: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  if (options.removeFromLazer) {
    if (db.hasSyncedData('lazer')) {
      const lazerIds = db.getExistingBeatmapsetIds({ lazer: true })
      for (const id of lazerIds) {
        existingIds.add(id)
      }
    } else {
      // Fallback to direct reading from Realm
      const lazerProc = await isOsuProcessRunning('lazer')
      if (lazerProc.running) {
        throw new Error(
          'Failed to read existing maps from osu!lazer: osu!lazer is currently running. Please close the game or sync database in Settings first.'
        )
      }

      try {
        const lazerPath = getOsuLazerPath()
        if (!lazerPath) {
          throw new Error('osu!lazer path is not configured in Settings.')
        }
        const lazerIds = await realmService.getBeatmapsetIds()
        for (const id of lazerIds) {
          existingIds.add(id)
        }
      } catch (error) {
        throw new Error(
          `Failed to read existing maps from osu!lazer: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  return existingIds
}
