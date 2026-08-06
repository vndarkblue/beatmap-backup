import { getOsuStablePath } from './settingsStore'
import type { LazerLocalBeatmapset } from './realmService'
import { buildLocalOszDirectoryName, sanitizeBackupFileName } from './backupNaming'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export interface LocalBeatmapExportOptions {
  stable: boolean
  outputDirectory?: string
  beatmapMd5s?: string[]
}

export interface LazerLocalBeatmapExportResult {
  success: boolean
  count: number
  outputPath: string
  skipped: {
    noExportableFiles: number
    totalMissingFiles: number
  }
  error?: string
}

export interface LocalBeatmapExportResult {
  success: boolean
  count: number
  outputPath: string
  skipped: {
    withBeatmapsetId: number
    withoutOsuFile: number
    withoutMatchingCollectionMd5: number
  }
  error?: string
}

interface StableLocalBeatmapFolder {
  name: string
  path: string
}

interface ZipEntrySource {
  absolutePath: string
  archivePath: string
  size: number
  crc32: number
  localHeaderOffset: number
}

const DOS_EPOCH = new Date('1980-01-01T00:00:00.000Z').getTime()

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let crc = i
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  crcTable[i] = crc >>> 0
}

const getDefaultOutputDirectoryName = (): string => buildLocalOszDirectoryName()

const hasBeatmapsetIdPrefix = (folderName: string): boolean => /^\d+($|\s)/.test(folderName)

const getOsuFilePaths = (folderPath: string): string[] => {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.osu$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
}

const fileMd5 = (filePath: string): string =>
  crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex').toLowerCase()

const hasMatchingOsuFile = (osuFilePaths: string[], beatmapMd5s: Set<string> | null): boolean => {
  if (!beatmapMd5s) return true
  return osuFilePaths.some((osuFilePath) => beatmapMd5s.has(fileMd5(osuFilePath)))
}

const normalizeMd5Filter = (beatmapMd5s?: string[]): Set<string> | null => {
  if (!beatmapMd5s) return null
  return new Set(beatmapMd5s.map((md5) => md5.trim().toLowerCase()).filter(Boolean))
}

const sanitizeFileName = (fileName: string): string => sanitizeBackupFileName(fileName, 'untitled')

const toArchivePath = (value: string): string => value.split(path.sep).join('/')

const getDosDateTime = (date: Date): { dosDate: number; dosTime: number } => {
  const safeDate = date.getTime() < DOS_EPOCH ? new Date(DOS_EPOCH) : date
  const year = Math.max(1980, safeDate.getFullYear())
  return {
    dosDate: ((year - 1980) << 9) | ((safeDate.getMonth() + 1) << 5) | safeDate.getDate(),
    dosTime:
      (safeDate.getHours() << 11) | (safeDate.getMinutes() << 5) | (safeDate.getSeconds() >> 1)
  }
}

const calculateCrc32 = (buffer: Buffer): number => {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const collectFiles = (rootPath: string): ZipEntrySource[] => {
  const files: ZipEntrySource[] = []
  const walk = (currentPath: string): void => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath)
        continue
      }
      if (!entry.isFile()) continue

      const relativePath = path.relative(rootPath, absolutePath)
      const content = fs.readFileSync(absolutePath)
      files.push({
        absolutePath,
        archivePath: toArchivePath(relativePath),
        size: content.length,
        crc32: calculateCrc32(content),
        localHeaderOffset: 0
      })
    }
  }

  walk(rootPath)
  return files.sort((a, b) => a.archivePath.localeCompare(b.archivePath))
}

const writeUInt16 = (value: number): Buffer => {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value)
  return buffer
}

const writeUInt32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0)
  return buffer
}

const buildLocalFileHeader = (entry: ZipEntrySource, modifiedAt: Date): Buffer => {
  const fileName = Buffer.from(entry.archivePath, 'utf-8')
  const { dosDate, dosTime } = getDosDateTime(modifiedAt)

  return Buffer.concat([
    writeUInt32(0x04034b50),
    writeUInt16(20),
    writeUInt16(0x0800),
    writeUInt16(0),
    writeUInt16(dosTime),
    writeUInt16(dosDate),
    writeUInt32(entry.crc32),
    writeUInt32(entry.size),
    writeUInt32(entry.size),
    writeUInt16(fileName.length),
    writeUInt16(0),
    fileName
  ])
}

const buildCentralDirectoryHeader = (entry: ZipEntrySource, modifiedAt: Date): Buffer => {
  const fileName = Buffer.from(entry.archivePath, 'utf-8')
  const { dosDate, dosTime } = getDosDateTime(modifiedAt)

  return Buffer.concat([
    writeUInt32(0x02014b50),
    writeUInt16(20),
    writeUInt16(20),
    writeUInt16(0x0800),
    writeUInt16(0),
    writeUInt16(dosTime),
    writeUInt16(dosDate),
    writeUInt32(entry.crc32),
    writeUInt32(entry.size),
    writeUInt32(entry.size),
    writeUInt16(fileName.length),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt32(0),
    writeUInt32(entry.localHeaderOffset),
    fileName
  ])
}

const buildEndOfCentralDirectory = (
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Buffer =>
  Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entryCount),
    writeUInt16(entryCount),
    writeUInt32(centralDirectorySize),
    writeUInt32(centralDirectoryOffset),
    writeUInt16(0)
  ])

const writeOszFromEntries = (entries: ZipEntrySource[], outputFilePath: string): void => {
  const chunks: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const modifiedAt = fs.statSync(entry.absolutePath).mtime
    const header = buildLocalFileHeader(entry, modifiedAt)
    const content = fs.readFileSync(entry.absolutePath)
    entry.localHeaderOffset = offset
    chunks.push(header, content)
    offset += header.length + content.length
  }

  const centralDirectoryOffset = offset
  const centralDirectoryChunks = entries.map((entry) =>
    buildCentralDirectoryHeader(entry, fs.statSync(entry.absolutePath).mtime)
  )
  const centralDirectorySize = centralDirectoryChunks.reduce((sum, chunk) => sum + chunk.length, 0)
  chunks.push(...centralDirectoryChunks)
  chunks.push(
    buildEndOfCentralDirectory(entries.length, centralDirectorySize, centralDirectoryOffset)
  )

  fs.writeFileSync(outputFilePath, Buffer.concat(chunks))
}

const createOszFromFolder = (sourceFolderPath: string, outputFilePath: string): void => {
  writeOszFromEntries(collectFiles(sourceFolderPath), outputFilePath)
}

// osu!lazer stores files at: files/{hash[0]}/{hash[0..1]}/{hash}
const getLazerFilePath = (lazerPath: string, hash: string): string =>
  path.join(lazerPath, 'files', hash[0], hash.substring(0, 2), hash)

const collectLazerEntries = (
  lazerPath: string,
  beatmapset: LazerLocalBeatmapset
): { entries: ZipEntrySource[]; missingFileCount: number } => {
  const entries: ZipEntrySource[] = []
  let missingFileCount = 0

  for (const { filename, hash } of beatmapset.files) {
    const filePath = getLazerFilePath(lazerPath, hash)
    if (!fs.existsSync(filePath)) {
      missingFileCount++
      continue
    }
    const content = fs.readFileSync(filePath)
    entries.push({
      absolutePath: filePath,
      archivePath: toArchivePath(filename),
      size: content.length,
      crc32: calculateCrc32(content),
      localHeaderOffset: 0
    })
  }

  return {
    entries: entries.sort((a, b) => a.archivePath.localeCompare(b.archivePath)),
    missingFileCount
  }
}

const buildLazerOszName = (beatmapset: LazerLocalBeatmapset): string => {
  // Use first 8 hex chars of UUID (without dashes) as a short unique prefix
  const idPrefix = beatmapset.id.replace(/-/g, '').substring(0, 8)
  const namePart = sanitizeFileName(`${beatmapset.artist} - ${beatmapset.title}`)
  return `${idPrefix} ${namePart}`
}

const getStableLocalBeatmapFolders = (
  songsPath: string,
  beatmapMd5s: Set<string> | null = null
): { folders: StableLocalBeatmapFolder[]; skipped: LocalBeatmapExportResult['skipped'] } => {
  const skipped = {
    withBeatmapsetId: 0,
    withoutOsuFile: 0,
    withoutMatchingCollectionMd5: 0
  }
  const folders: StableLocalBeatmapFolder[] = []
  const entries = fs.readdirSync(songsPath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (hasBeatmapsetIdPrefix(entry.name)) {
      skipped.withBeatmapsetId += 1
      continue
    }

    const folderPath = path.join(songsPath, entry.name)
    const osuFilePaths = getOsuFilePaths(folderPath)
    if (osuFilePaths.length === 0) {
      skipped.withoutOsuFile += 1
      continue
    }
    if (!hasMatchingOsuFile(osuFilePaths, beatmapMd5s)) {
      skipped.withoutMatchingCollectionMd5 += 1
      continue
    }

    folders.push({
      name: entry.name,
      path: folderPath
    })
  }

  return {
    folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
    skipped
  }
}

export const localBeatmapExport = {
  getDefaultOutputDirectoryName,

  exportLazerLocalBeatmaps(
    beatmapsets: LazerLocalBeatmapset[],
    lazerPath: string,
    outputDirectory: string
  ): LazerLocalBeatmapExportResult {
    fs.mkdirSync(outputDirectory, { recursive: true })

    let count = 0
    let noExportableFiles = 0
    let totalMissingFiles = 0

    for (const beatmapset of beatmapsets) {
      const { entries, missingFileCount } = collectLazerEntries(lazerPath, beatmapset)
      totalMissingFiles += missingFileCount

      if (entries.length === 0) {
        noExportableFiles++
        continue
      }

      const oszPath = path.join(outputDirectory, `${buildLazerOszName(beatmapset)}.osz`)
      writeOszFromEntries(entries, oszPath)
      count++
    }

    return {
      success: true,
      count,
      outputPath: outputDirectory,
      skipped: { noExportableFiles, totalMissingFiles }
    }
  },

  scanStableLocalBeatmaps(): { count: number; skipped: LocalBeatmapExportResult['skipped'] } {
    const osuStablePath = getOsuStablePath()
    if (!osuStablePath) {
      throw new Error('Osu stable path not set')
    }

    const songsPath = path.join(osuStablePath, 'Songs')
    if (!fs.existsSync(songsPath)) {
      throw new Error('Songs directory not found')
    }

    const { folders, skipped } = getStableLocalBeatmapFolders(songsPath)
    return {
      count: folders.length,
      skipped
    }
  },

  exportStableLocalBeatmaps(options: LocalBeatmapExportOptions): LocalBeatmapExportResult {
    if (!options.stable) {
      return {
        success: true,
        count: 0,
        outputPath: '',
        skipped: {
          withBeatmapsetId: 0,
          withoutOsuFile: 0,
          withoutMatchingCollectionMd5: 0
        }
      }
    }

    const osuStablePath = getOsuStablePath()
    if (!osuStablePath) {
      throw new Error('Osu stable path not set')
    }

    const songsPath = path.join(osuStablePath, 'Songs')
    if (!fs.existsSync(songsPath)) {
      throw new Error('Songs directory not found')
    }

    const outputPath =
      options.outputDirectory ?? path.join(osuStablePath, getDefaultOutputDirectoryName())
    fs.mkdirSync(outputPath, { recursive: true })

    const { folders, skipped } = getStableLocalBeatmapFolders(
      songsPath,
      normalizeMd5Filter(options.beatmapMd5s)
    )
    for (const folder of folders) {
      const oszPath = path.join(outputPath, `${sanitizeFileName(folder.name)}.osz`)
      createOszFromFolder(folder.path, oszPath)
    }

    return {
      success: true,
      count: folders.length,
      outputPath,
      skipped
    }
  }
}

export default localBeatmapExport
