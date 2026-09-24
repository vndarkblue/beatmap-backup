import { describe, expect, it, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import {
  parseTitleFromFileName,
  parseOsuMetadata,
  extractMetadataFromOsz,
  resolveBeatmapTitle
} from '../../../src/services/download/oszMetadata'

describe('oszMetadata', () => {
  const tempFiles: string[] = []

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f)
        } catch {
          // ignore
        }
      }
    }
    tempFiles.length = 0
  })

  describe('parseTitleFromFileName', () => {
    it('parses artist and title with leading beatmapset id', () => {
      expect(parseTitleFromFileName('182958 Sasaki Sayaka - Marine Blue ni Sotte.osz')).toBe(
        'Sasaki Sayaka - Marine Blue ni Sotte'
      )
    })

    it('parses artist and title with bracketed id', () => {
      expect(parseTitleFromFileName('[182958] Sasaki Sayaka - Marine Blue ni Sotte.osz')).toBe(
        'Sasaki Sayaka - Marine Blue ni Sotte'
      )
    })

    it('parses artist and title with hyphen separator', () => {
      expect(parseTitleFromFileName('182958 - Sasaki Sayaka - Marine Blue ni Sotte.osz')).toBe(
        'Sasaki Sayaka - Marine Blue ni Sotte'
      )
    })

    it('parses artist and title without id', () => {
      expect(parseTitleFromFileName('Sasaki Sayaka - Marine Blue ni Sotte.osz')).toBe(
        'Sasaki Sayaka - Marine Blue ni Sotte'
      )
    })

    it('returns null for numeric-only filenames', () => {
      expect(parseTitleFromFileName('182958.osz')).toBeNull()
      expect(parseTitleFromFileName('182958 (1).osz')).toBeNull()
    })

    it('returns null for empty or undefined filenames', () => {
      expect(parseTitleFromFileName('')).toBeNull()
      expect(parseTitleFromFileName(undefined)).toBeNull()
    })
  })

  describe('parseOsuMetadata', () => {
    it('extracts Artist and Title from [Metadata]', () => {
      const sample = `
osu file format v14

[General]
AudioFilename: audio.mp3

[Metadata]
Title:Marine Blue ni Sotte
TitleUnicode:マリーンブルーに沿って
Artist:Sasaki Sayaka
ArtistUnicode:佐々木恵梨
Creator:Lasse
Version:Insane
`
      const meta = parseOsuMetadata(sample)
      expect(meta.artist).toBe('Sasaki Sayaka')
      expect(meta.title).toBe('Marine Blue ni Sotte')
    })

    it('falls back to unicode when standard fields are missing', () => {
      const sample = `
[Metadata]
TitleUnicode:テストタイトル
ArtistUnicode:テストアーティスト
`
      const meta = parseOsuMetadata(sample)
      expect(meta.artist).toBe('テストアーティスト')
      expect(meta.title).toBe('テストタイトル')
    })
  })

  describe('extractMetadataFromOsz & resolveBeatmapTitle', () => {
    it('extracts metadata from an in-memory constructed .osz zip', () => {
      const tempPath = path.join(os.tmpdir(), `test-beatmap-${Date.now()}.osz`)
      tempFiles.push(tempPath)

      const osuContent = Buffer.from(`[Metadata]\r\nTitle:Test Title\r\nArtist:Test Artist\r\n`)
      const compressedOsu = zlib.deflateRawSync(osuContent)
      const fileName = Buffer.from('test.osu', 'utf8')

      // Build a minimal valid ZIP
      const localHeader = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]), // signature
        Buffer.from([20, 0]), // version needed
        Buffer.from([0, 0]), // flags
        Buffer.from([8, 0]), // compression = deflate
        Buffer.from([0, 0, 0, 0]), // time / date
        Buffer.from([0, 0, 0, 0]), // crc-32 (ignored for test)
        Buffer.alloc(4), // compressed size
        Buffer.alloc(4), // uncompressed size
        Buffer.alloc(2), // filename length
        Buffer.alloc(2) // extra length
      ])
      localHeader.writeUInt32LE(compressedOsu.length, 18)
      localHeader.writeUInt32LE(osuContent.length, 22)
      localHeader.writeUInt16LE(fileName.length, 26)
      localHeader.writeUInt16LE(0, 28)

      const localRecord = Buffer.concat([localHeader, fileName, compressedOsu])

      const cdHeader = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x01, 0x02]), // signature
        Buffer.from([20, 0, 20, 0]), // versions
        Buffer.from([0, 0]), // flags
        Buffer.from([8, 0]), // compression
        Buffer.from([0, 0, 0, 0]), // time / date
        Buffer.from([0, 0, 0, 0]), // crc-32
        Buffer.alloc(4), // compressed size
        Buffer.alloc(4), // uncompressed size
        Buffer.alloc(2), // filename length
        Buffer.alloc(2), // extra length
        Buffer.alloc(2), // comment length
        Buffer.alloc(2), // disk number start
        Buffer.alloc(2), // internal attrs
        Buffer.alloc(4), // external attrs
        Buffer.alloc(4) // local header offset
      ])
      cdHeader.writeUInt32LE(compressedOsu.length, 20)
      cdHeader.writeUInt32LE(osuContent.length, 24)
      cdHeader.writeUInt16LE(fileName.length, 28)
      cdHeader.writeUInt32LE(0, 42) // offset 0

      const cdRecord = Buffer.concat([cdHeader, fileName])

      const eocd = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x05, 0x06]), // signature
        Buffer.from([0, 0, 0, 0]), // disk nums
        Buffer.from([1, 0, 1, 0]), // entries (1 on this disk, 1 total)
        Buffer.alloc(4), // cd size
        Buffer.alloc(4), // cd offset
        Buffer.from([0, 0]) // comment length
      ])
      eocd.writeUInt32LE(cdRecord.length, 12)
      eocd.writeUInt32LE(localRecord.length, 16)

      const zipFile = Buffer.concat([localRecord, cdRecord, eocd])
      fs.writeFileSync(tempPath, zipFile)

      const meta = extractMetadataFromOsz(tempPath)
      expect(meta).toEqual({
        artist: 'Test Artist',
        title: 'Test Title'
      })

      // When fileName is just numeric, resolveBeatmapTitle reads from the zip
      const resolved = resolveBeatmapTitle(tempPath, '12345.osz', '12345')
      expect(resolved).toBe('Test Artist - Test Title')
    })
  })
})
