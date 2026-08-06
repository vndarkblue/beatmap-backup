import { getOsuStablePath, getOsuLazerPath } from './settingsStore'
import { realmService } from './realmService'
import { is } from '@electron-toolkit/utils'
import path from 'path'
import fs from 'fs'
import { collectionService } from './collection/collectionService'
import { localBeatmapExport } from './localBeatmapExport'
import {
  buildBackupFileName,
  buildLocalOszDirectoryName,
  getBackupBaseNameFromFilePath
} from './backupNaming'
import type { CollectionMergeMode } from './collection/types'

export interface ExportOptions {
  stable: boolean
  lazer: boolean
  backupOnlineIds?: boolean
  backupLocalBeatmaps?: boolean
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
  local?: {
    count: number
    outputPath: string
    skipped: {
      withBeatmapsetId: number
      withoutOsuFile: number
      withoutMatchingCollectionMd5: number
    }
  }
  localLazer?: {
    count: number
    outputPath: string
    skipped: {
      noExportableFiles: number
      totalMissingFiles: number
    }
  }
  error?: string
}

export interface ExportEstimateResult {
  count: number
  estimatedBytes: number
  localCount?: number
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

const wantsOnlineBackup = (options: ExportOptions): boolean => options.backupOnlineIds !== false

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

    if (wantsOnlineBackup(options)) {
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
    }

    const uniqueIds = Array.from(new Set(beatmapsetIds)).sort((a, b) => a - b)
    const estimatedBytes = Buffer.byteLength(buildBackupContent(uniqueIds, options), 'utf-8')

    let localCount: number | undefined
    if (options.backupLocalBeatmaps) {
      let stableLocal = 0
      let lazerLocal = 0
      if (options.stable) {
        stableLocal = localBeatmapExport.scanStableLocalBeatmaps().count
      }
      if (options.lazer) {
        const beatmapsets = await realmService.getLazerLocalBeatmapsets()
        lazerLocal = beatmapsets.length
      }
      localCount = stableLocal + lazerLocal
    }

    return {
      count: uniqueIds.length,
      estimatedBytes,
      ...(localCount !== undefined && { localCount })
    }
  },

  async exportData(options: ExportOptions): Promise<ExportResult> {
    if (is.dev) console.log('exportService.exportData called with options:', options)
    try {
      const { dialog } = await import('electron')
      const beatmapsetIds: number[] = []
      let collectionStats: ExportResult['stats'] | undefined
      let stableCollectionBeatmapMd5s: string[] | undefined
      const shouldWriteOnlineBackup = wantsOnlineBackup(options)

      let defaultPath = ''

      if (shouldWriteOnlineBackup && options.backupByCollection) {
        const resolved = await collectionService.resolveCollectionBeatmapsetIds({
          stable: options.stable,
          lazer: options.lazer,
          mergeMode: options.collectionMergeMode ?? 'merge',
          selectedKeys: options.selectedCollections ?? []
        })
        beatmapsetIds.push(...resolved.ids)
        defaultPath = resolved.defaultFileName
        collectionStats = resolved.stats
        stableCollectionBeatmapMd5s = resolved.stableBeatmapMd5s
      } else if (shouldWriteOnlineBackup && options.stable) {
        if (is.dev) console.log('Processing stable beatmaps...')
        const osuStablePath = getOsuStablePath()
        if (is.dev) console.log('Osu stable path:', osuStablePath)
        if (!osuStablePath) {
          throw new Error('Osu stable path not set')
        }

        const songsPath = path.join(osuStablePath, 'Songs')
        if (is.dev) console.log('Songs path:', songsPath)
        if (!fs.existsSync(songsPath)) {
          throw new Error('Songs directory not found')
        }

        const stableIds = scanStableBeatmapsetIds(songsPath)
        if (is.dev) {
          console.log(
            'Found',
            exportService.getLastStableFolderScanSummary().processedFolders,
            'folders in Songs directory'
          )
          console.log('Found', beatmapsetIds.length + stableIds.length, 'stable beatmapset IDs')
        }
        beatmapsetIds.push(...stableIds)
      }

      if (shouldWriteOnlineBackup && !options.backupByCollection && options.lazer) {
        if (is.dev) console.log('Processing lazer beatmaps...')
        const lazerIds = await realmService.getBeatmapsetIds()
        if (is.dev) console.log('Found', lazerIds.length, 'lazer beatmapset IDs')
        beatmapsetIds.push(...lazerIds)
      }

      // Remove duplicates and sort
      const uniqueIds = Array.from(new Set(beatmapsetIds)).sort((a, b) => a - b)
      if (is.dev) console.log('Total unique beatmapset IDs:', uniqueIds.length)

      // Get save path from user
      if (is.dev) console.log('Opening save dialog...')
      let filePath: string | undefined

      if (shouldWriteOnlineBackup) {
        const saveResult = await dialog.showSaveDialog({
          title: 'Save Beatmapset IDs',
          defaultPath: defaultPath || buildBackupFileName(),
          filters: [
            { name: 'Beatmap Backup Files', extensions: ['bbak'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        filePath = saveResult.filePath
      } else {
        // Local-only export: ask for output directory instead of a .bbak file
        const openResult = await dialog.showOpenDialog({
          title: 'Select Output Folder',
          properties: ['openDirectory', 'createDirectory']
        })
        filePath = openResult.filePaths[0]
      }

      if (!filePath) {
        if (is.dev) console.log('Save dialog cancelled')
        return {
          success: false,
          count: 0,
          outputPath: '',
          error: 'cancelled'
        }
      }

      if (shouldWriteOnlineBackup) {
        if (is.dev) console.log('Saving to file:', filePath)
        // Write to file with header and comments
        fs.writeFileSync(filePath, buildBackupContent(uniqueIds, options))
        if (is.dev) console.log('File saved successfully')
      }

      const result: ExportResult = {
        success: true,
        count: uniqueIds.length,
        outputPath: filePath
      }

      // Stable and lazer local exports share the same output directory so all .osz
      // files land together, following the same backup-YYYYMMDD naming convention.
      const localOutputDirectory =
        options.backupLocalBeatmaps && (options.stable || options.lazer)
          ? shouldWriteOnlineBackup
            ? path.join(path.dirname(filePath), getBackupBaseNameFromFilePath(filePath))
            : path.join(filePath, buildLocalOszDirectoryName())
          : ''

      if (options.backupLocalBeatmaps && options.stable) {
        if (options.backupByCollection && !stableCollectionBeatmapMd5s) {
          stableCollectionBeatmapMd5s =
            await collectionService.resolveSelectedStableCollectionBeatmapMd5s({
              stable: options.stable,
              lazer: options.lazer,
              mergeMode: options.collectionMergeMode ?? 'merge',
              selectedKeys: options.selectedCollections ?? []
            })
        }
        const localResult = localBeatmapExport.exportStableLocalBeatmaps({
          stable: options.stable,
          outputDirectory: localOutputDirectory,
          beatmapMd5s: options.backupByCollection ? (stableCollectionBeatmapMd5s ?? []) : undefined
        })
        result.local = {
          count: localResult.count,
          outputPath: localResult.outputPath,
          skipped: localResult.skipped
        }
      }

      if (options.backupLocalBeatmaps && options.lazer) {
        const lazerPath = getOsuLazerPath()
        if (!lazerPath) throw new Error('Osu lazer path not set')

        const beatmapsets = await realmService.getLazerLocalBeatmapsets()
        const lazerResult = localBeatmapExport.exportLazerLocalBeatmaps(
          beatmapsets,
          lazerPath,
          localOutputDirectory
        )
        result.localLazer = {
          count: lazerResult.count,
          outputPath: lazerResult.outputPath,
          skipped: lazerResult.skipped
        }
      }

      if (
        options.backupLocalBeatmaps &&
        (options.stable || options.lazer) &&
        !shouldWriteOnlineBackup
      ) {
        result.outputPath = localOutputDirectory
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
