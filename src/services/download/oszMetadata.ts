import fs from 'fs'
import zlib from 'zlib'
import { DatabaseService } from '../database/databaseService'
import { parseTitleFromFileName } from '../../utils/beatmapTitle'

export { parseTitleFromFileName }

/**
 * Parses [Metadata] section from the content of an .osu file.
 */
export function parseOsuMetadata(content: string): { artist?: string; title?: string } {
  let inMetadata = false
  let artist = ''
  let title = ''
  let artistUnicode = ''
  let titleUnicode = ''

  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      if (trimmed === '[Metadata]') {
        inMetadata = true
        continue
      } else if (inMetadata) {
        // Exited [Metadata] section
        break
      }
    }

    if (inMetadata) {
      const colonIdx = line.indexOf(':')
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim()
        const val = line.slice(colonIdx + 1).trim()
        if (key === 'Title') title = val
        else if (key === 'TitleUnicode') titleUnicode = val
        else if (key === 'Artist') artist = val
        else if (key === 'ArtistUnicode') artistUnicode = val
      }
    }
  }

  return {
    artist: artist || artistUnicode || undefined,
    title: title || titleUnicode || undefined
  }
}

/**
 * Extracts metadata from the first .osu file found inside an .osz (ZIP) archive.
 */
export function extractMetadataFromOsz(
  filePath: string
): { artist?: string; title?: string } | null {
  try {
    if (!fs.existsSync(filePath)) return null

    const fd = fs.openSync(filePath, 'r')
    try {
      const stats = fs.fstatSync(fd)
      const fileSize = stats.size
      if (fileSize < 22) return null

      // Find End of Central Directory (EOCD)
      // EOCD is at least 22 bytes, comment can be up to 65535 bytes
      const readLen = Math.min(fileSize, 65535 + 22)
      const buffer = Buffer.alloc(readLen)
      fs.readSync(fd, buffer, 0, readLen, fileSize - readLen)

      let eocdOffset = -1
      for (let i = readLen - 22; i >= 0; i--) {
        if (
          buffer[i] === 0x50 &&
          buffer[i + 1] === 0x4b &&
          buffer[i + 2] === 0x05 &&
          buffer[i + 3] === 0x06
        ) {
          eocdOffset = i
          break
        }
      }
      if (eocdOffset === -1) return null

      const cdEntries = buffer.readUInt16LE(eocdOffset + 10)
      const cdSize = buffer.readUInt32LE(eocdOffset + 12)
      const cdOffset = buffer.readUInt32LE(eocdOffset + 16)

      // Read Central Directory
      const cdBuffer = Buffer.alloc(cdSize)
      fs.readSync(fd, cdBuffer, 0, cdSize, cdOffset)

      let offset = 0
      let osuLocalHeaderOffset = -1
      let osuCompressedSize = 0
      let osuCompressionMethod = 0

      for (let i = 0; i < cdEntries && offset + 46 <= cdSize; i++) {
        const sig = cdBuffer.readUInt32LE(offset)
        if (sig !== 0x02014b50) break

        const compressionMethod = cdBuffer.readUInt16LE(offset + 10)
        const compressedSize = cdBuffer.readUInt32LE(offset + 20)
        const fileNameLen = cdBuffer.readUInt16LE(offset + 28)
        const extraLen = cdBuffer.readUInt16LE(offset + 30)
        const commentLen = cdBuffer.readUInt16LE(offset + 32)
        const localHeaderOffset = cdBuffer.readUInt32LE(offset + 42)

        const fileName = cdBuffer.toString('utf8', offset + 46, offset + 46 + fileNameLen)
        if (fileName.toLowerCase().endsWith('.osu')) {
          osuLocalHeaderOffset = localHeaderOffset
          osuCompressedSize = compressedSize
          osuCompressionMethod = compressionMethod
          break
        }

        offset += 46 + fileNameLen + extraLen + commentLen
      }

      if (osuLocalHeaderOffset === -1) return null

      // Read local file header to find exact start of file data
      const localHeaderBuf = Buffer.alloc(30)
      fs.readSync(fd, localHeaderBuf, 0, 30, osuLocalHeaderOffset)
      if (localHeaderBuf.readUInt32LE(0) !== 0x04034b50) return null

      const localFileNameLen = localHeaderBuf.readUInt16LE(26)
      const localExtraLen = localHeaderBuf.readUInt16LE(28)
      const dataOffset = osuLocalHeaderOffset + 30 + localFileNameLen + localExtraLen

      const compressedData = Buffer.alloc(osuCompressedSize)
      fs.readSync(fd, compressedData, 0, osuCompressedSize, dataOffset)

      let uncompressedText = ''
      if (osuCompressionMethod === 0) {
        uncompressedText = compressedData.toString('utf8')
      } else if (osuCompressionMethod === 8) {
        const decompressed = zlib.inflateRawSync(compressedData)
        uncompressedText = decompressed.toString('utf8')
      } else {
        return null
      }

      return parseOsuMetadata(uncompressedText)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

/**
 * Resolves a beatmap's title by:
 * 1. Trying to parse from fileName (instant, no I/O)
 * 2. Querying local SQLite database (if beatmapsetId exists in DB)
 * 3. Extracting metadata from the .osz ZIP archive directly
 */
export function resolveBeatmapTitle(
  filePath?: string,
  fileName?: string,
  beatmapsetId?: string | number
): string | null {
  // 1. Primary: parse from filename
  const parsed = parseTitleFromFileName(fileName)
  if (parsed) return parsed

  // 2. Local database cache
  if (beatmapsetId) {
    try {
      const db = DatabaseService.getInstance()
      const dbTitle = db.getBeatmapsetTitle(Number(beatmapsetId))
      if (dbTitle) return dbTitle
    } catch {
      // Database might not be initialized or accessible
    }
  }

  // 3. Fallback: inspect .osz file on disk
  if (filePath) {
    const meta = extractMetadataFromOsz(filePath)
    if (meta) {
      if (meta.artist && meta.title) {
        return `${meta.artist} - ${meta.title}`
      }
      return meta.title || meta.artist || null
    }
  }

  return null
}
