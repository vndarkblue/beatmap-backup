import path from 'path'
import fs from 'fs'
import os from 'os'
import { execSync } from 'child_process'
import { getOsuStablePath } from '../settingsStore'
import { realmService } from '../realmService'
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

  for (const id of ids) {
    if (!/^\d+$/.test(id.trim())) {
      throw new Error(`Invalid beatmapset ID: ${id}`)
    }
  }
}

export async function getExistingBeatmapsetIds(options: DownloadOptions): Promise<Set<number>> {
  const existingIds = new Set<number>()

  if (options.removeFromStable) {
    try {
      const osuStablePath = getOsuStablePath()
      if (osuStablePath) {
        const songsPath = path.join(osuStablePath, 'Songs')
        if (fs.existsSync(songsPath)) {
          const folders = fs.readdirSync(songsPath)
          for (const folder of folders) {
            const match = folder.match(/^(\d+)\s/)
            if (match) {
              const id = parseInt(match[1])
              if (!isNaN(id)) existingIds.add(id)
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get stable beatmapset IDs:', error)
    }
  }

  if (options.removeFromLazer) {
    try {
      const lazerIds = await realmService.getBeatmapsetIds()
      lazerIds.forEach((id) => existingIds.add(id))
    } catch (error) {
      console.warn('Failed to get lazer beatmapset IDs:', error)
    }
  }

  return existingIds
}
