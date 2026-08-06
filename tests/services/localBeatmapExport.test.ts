import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetOsuStablePath = vi.fn<() => string>()

vi.mock('../../src/services/settingsStore', () => ({
  getOsuStablePath: () => mockGetOsuStablePath()
}))

describe('localBeatmapExport', () => {
  let tempRoot: string
  let osuRoot: string
  let songsPath: string

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-beatmap-export-'))
    osuRoot = path.join(tempRoot, 'osu')
    songsPath = path.join(osuRoot, 'Songs')
    fs.mkdirSync(songsPath, { recursive: true })
    mockGetOsuStablePath.mockReturnValue(osuRoot)
  })

  afterEach(() => {
    vi.clearAllMocks()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  it('exports only stable folders without beatmapset ids that contain osu files', async () => {
    const onlineFolder = path.join(songsPath, '123 Artist - Online')
    const localFolder = path.join(songsPath, 'Artist - Local')
    const noOsuFolder = path.join(songsPath, 'Artist - Missing Osu')
    const outputDirectory = path.join(tempRoot, 'backup-20260806-local-osz')

    fs.mkdirSync(onlineFolder)
    fs.writeFileSync(path.join(onlineFolder, 'online.osu'), 'osu file format v14')

    fs.mkdirSync(localFolder)
    fs.writeFileSync(path.join(localFolder, 'local.osu'), 'osu file format v14')
    fs.writeFileSync(path.join(localFolder, 'audio.mp3'), 'audio')

    fs.mkdirSync(noOsuFolder)
    fs.writeFileSync(path.join(noOsuFolder, 'cover.jpg'), 'cover')

    const { localBeatmapExport } = await import('../../src/services/localBeatmapExport')
    const scan = localBeatmapExport.scanStableLocalBeatmaps()
    const result = localBeatmapExport.exportStableLocalBeatmaps({
      stable: true,
      outputDirectory
    })

    expect(scan).toEqual({
      count: 1,
      skipped: {
        withBeatmapsetId: 1,
        withoutOsuFile: 1,
        withoutMatchingCollectionMd5: 0
      }
    })
    expect(result).toEqual({
      success: true,
      count: 1,
      outputPath: outputDirectory,
      skipped: {
        withBeatmapsetId: 1,
        withoutOsuFile: 1,
        withoutMatchingCollectionMd5: 0
      }
    })

    const oszPath = path.join(outputDirectory, 'Artist - Local.osz')
    expect(fs.existsSync(oszPath)).toBe(true)
    expect(fs.existsSync(path.join(outputDirectory, '123 Artist - Online.osz'))).toBe(false)
    expect(fs.existsSync(path.join(outputDirectory, 'Artist - Missing Osu.osz'))).toBe(false)

    const oszContent = fs.readFileSync(oszPath)
    expect(oszContent.readUInt32LE(0)).toBe(0x04034b50)
    expect(oszContent.includes(Buffer.from('local.osu'))).toBe(true)
    expect(oszContent.includes(Buffer.from('audio.mp3'))).toBe(true)
  })
})
