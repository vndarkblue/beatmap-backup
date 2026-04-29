import { getOsuStablePath } from './settingsStore'
import { realmService } from './realmService'
import path from 'path'
import fs from 'fs'
import { collectionService } from './collection/collectionService'
import type { CollectionMergeMode } from './collection/types'

export interface ExportOptions {
  stable: boolean
  lazer: boolean
  backupByCollection?: boolean
  collectionMergeMode?: CollectionMergeMode
  selectedCollections?: string[]
}

export interface ExportResult {
  success: boolean
  count: number
  outputPath: string
  stats?: {
    resolved: number
    pendingSync: number
    missingLocal: number
    apiNotFound: number
  }
  error?: string
}

export interface ExportEstimateResult {
  count: number
  estimatedBytes: number
}

interface StableFolderScanSummary {
  processedFolders: number
  matchedIds: number
  skippedInvalidNames: number
}

let lastStableFolderScanSummary: StableFolderScanSummary = {
  processedFolders: 0,
  matchedIds: 0,
  skippedInvalidNames: 0
}

const buildBackupContent = (ids: number[], options: ExportOptions): string => {
  const header = `# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: ${new Date().toISOString()}
# Total beatmaps: ${ids.length}
# Source: ${options.stable ? 'Stable' : ''}${options.stable && options.lazer ? ' + ' : ''}${options.lazer ? 'Lazer' : ''}

`
  return header + ids.join('\n')
}

const scanStableBeatmapsetIds = (songsPath: string): number[] => {
  const summary: StableFolderScanSummary = {
    processedFolders: 0,
    matchedIds: 0,
    skippedInvalidNames: 0
  }
  const ids: number[] = []
  const folders = fs.readdirSync(songsPath)
  for (const folder of folders) {
    summary.processedFolders += 1
    const match = folder.match(/^(\d+)\s/)
    if (!match) {
      summary.skippedInvalidNames += 1
      continue
    }
    const id = parseInt(match[1])
    if (isNaN(id)) {
      summary.skippedInvalidNames += 1
      continue
    }
    summary.matchedIds += 1
    ids.push(id)
  }
  lastStableFolderScanSummary = summary
  return ids
}

export const exportService = {
  getLastStableFolderScanSummary(): StableFolderScanSummary {
    return { ...lastStableFolderScanSummary }
  },

  async estimateExportData(options: ExportOptions): Promise<ExportEstimateResult> {
    const beatmapsetIds: number[] = []

    if (options.backupByCollection) {
      const resolved = await collectionService.resolveCollectionBeatmapsetIds({
        stable: options.stable,
        lazer: options.lazer,
        mergeMode: options.collectionMergeMode ?? 'merge',
        selectedKeys: options.selectedCollections ?? []
      })
      beatmapsetIds.push(...resolved.ids)
    } else if (options.stable) {
      const osuStablePath = getOsuStablePath()
      if (!osuStablePath) {
        throw new Error('Osu stable path not set')
      }
      const songsPath = path.join(osuStablePath, 'Songs')
      if (!fs.existsSync(songsPath)) {
        throw new Error('Songs directory not found')
      }
      beatmapsetIds.push(...scanStableBeatmapsetIds(songsPath))
    }

    if (!options.backupByCollection && options.lazer) {
      const lazerIds = await realmService.getBeatmapsetIds()
      beatmapsetIds.push(...lazerIds)
    }

    const uniqueIds = Array.from(new Set(beatmapsetIds)).sort((a, b) => a - b)
    const estimatedBytes = Buffer.byteLength(buildBackupContent(uniqueIds, options), 'utf-8')

    return {
      count: uniqueIds.length,
      estimatedBytes
    }
  },

  async exportData(options: ExportOptions): Promise<ExportResult> {
    console.log('exportService.exportData called with options:', options)
    try {
      const { dialog } = await import('electron')
      const beatmapsetIds: number[] = []
      let collectionStats: ExportResult['stats'] | undefined

      let defaultPath = ''

      if (options.backupByCollection) {
        const resolved = await collectionService.resolveCollectionBeatmapsetIds({
          stable: options.stable,
          lazer: options.lazer,
          mergeMode: options.collectionMergeMode ?? 'merge',
          selectedKeys: options.selectedCollections ?? []
        })
        beatmapsetIds.push(...resolved.ids)
        defaultPath = resolved.defaultFileName
        collectionStats = resolved.stats
      } else if (options.stable) {
        console.log('Processing stable beatmaps...')
        const osuStablePath = getOsuStablePath()
        console.log('Osu stable path:', osuStablePath)
        if (!osuStablePath) {
          throw new Error('Osu stable path not set')
        }

        const songsPath = path.join(osuStablePath, 'Songs')
        console.log('Songs path:', songsPath)
        if (!fs.existsSync(songsPath)) {
          throw new Error('Songs directory not found')
        }

        const stableIds = scanStableBeatmapsetIds(songsPath)
        console.log(
          'Found',
          exportService.getLastStableFolderScanSummary().processedFolders,
          'folders in Songs directory'
        )
        beatmapsetIds.push(...stableIds)
        console.log('Found', beatmapsetIds.length, 'stable beatmapset IDs')
      }

      if (!options.backupByCollection && options.lazer) {
        console.log('Processing lazer beatmaps...')
        const lazerIds = await realmService.getBeatmapsetIds()
        console.log('Found', lazerIds.length, 'lazer beatmapset IDs')
        beatmapsetIds.push(...lazerIds)
      }

      // Remove duplicates and sort
      const uniqueIds = Array.from(new Set(beatmapsetIds)).sort((a, b) => a - b)
      console.log('Total unique beatmapset IDs:', uniqueIds.length)

      // Get save path from user
      console.log('Opening save dialog...')
      const today = new Date()
      const formattedDate = today.toISOString().slice(0, 10).replace(/-/g, '')
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Beatmapset IDs',
        defaultPath: defaultPath || `backup-${formattedDate}.bbak`,
        filters: [
          { name: 'Beatmap Backup Files', extensions: ['bbak'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (!filePath) {
        console.log('Save dialog cancelled')
        return {
          success: false,
          count: 0,
          outputPath: '',
          error: 'cancelled'
        }
      }

      console.log('Saving to file:', filePath)
      // Write to file with header and comments
      fs.writeFileSync(filePath, buildBackupContent(uniqueIds, options))
      console.log('File saved successfully')

      const result: ExportResult = {
        success: true,
        count: uniqueIds.length,
        outputPath: filePath
      }
      if (options.backupByCollection) result.stats = collectionStats
      return result
    } catch (error: unknown) {
      console.error('Export failed in exportService:', error)
      if (error instanceof Error) {
        console.error('Error name:', error.name)
        console.error('Error message:', error.message)
        console.error('Error stack:', error.stack)
      }
      throw error
    }
  }
}
