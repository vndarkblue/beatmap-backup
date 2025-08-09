import { getOsuStablePath } from './settingsStore'
import { realmService } from './realmService'
import path from 'path'
import fs from 'fs'
import { dialog } from 'electron'

export interface ExportOptions {
  stable: boolean
  lazer: boolean
}

export interface ExportResult {
  success: boolean
  count: number
  outputPath: string
  error?: string
}

export const exportService = {
  async exportData(options: ExportOptions): Promise<ExportResult> {
    console.log('exportService.exportData called with options:', options)
    try {
      const beatmapsetIds: number[] = []

      if (options.stable) {
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

        const folders = fs.readdirSync(songsPath)
        console.log('Found', folders.length, 'folders in Songs directory')
        for (const folder of folders) {
          const match = folder.match(/^(\d+)\s/)
          if (match) {
            const id = parseInt(match[1])
            if (!isNaN(id)) {
              beatmapsetIds.push(id)
            }
          }
        }
        console.log('Found', beatmapsetIds.length, 'stable beatmapset IDs')
      }

      if (options.lazer) {
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
        defaultPath: `backup-${formattedDate}.bbak`,
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
      const header = `# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: ${new Date().toISOString()}
# Total beatmaps: ${uniqueIds.length}
# Source: ${options.stable ? 'Stable' : ''}${options.stable && options.lazer ? ' + ' : ''}${options.lazer ? 'Lazer' : ''}

`
      fs.writeFileSync(filePath, header + uniqueIds.join('\n'))
      console.log('File saved successfully')

      return {
        success: true,
        count: uniqueIds.length,
        outputPath: filePath
      }
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
