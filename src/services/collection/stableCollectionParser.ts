import fs from 'fs'

interface BinaryCursor {
  offset: number
  buffer: Buffer
}

function readInt32(cursor: BinaryCursor): number {
  const value = cursor.buffer.readInt32LE(cursor.offset)
  cursor.offset += 4
  return value
}

function readByte(cursor: BinaryCursor): number {
  const value = cursor.buffer.readUInt8(cursor.offset)
  cursor.offset += 1
  return value
}

function readULEB128(cursor: BinaryCursor): number {
  let result = 0
  let shift = 0
  while (true) {
    const byte = readByte(cursor)
    result |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
  }
  return result
}

function readOsuString(cursor: BinaryCursor): string {
  const indicator = readByte(cursor)
  if (indicator === 0x00) {
    return ''
  }
  if (indicator !== 0x0b) {
    throw new Error(`Invalid osu string marker: ${indicator}`)
  }
  const length = readULEB128(cursor)
  const value = cursor.buffer.toString('utf8', cursor.offset, cursor.offset + length)
  cursor.offset += length
  return value
}

export interface StableCollectionRecord {
  name: string
  beatmapMd5s: string[]
}

export function parseStableCollectionDb(filePath: string): StableCollectionRecord[] {
  const buffer = fs.readFileSync(filePath)
  const cursor: BinaryCursor = { offset: 0, buffer }

  // collection.db format starts with version then collection count
  readInt32(cursor)
  const collectionCount = readInt32(cursor)
  if (collectionCount < 0) {
    throw new Error('Invalid collection.db format: negative collection count')
  }

  const collections: StableCollectionRecord[] = []
  for (let i = 0; i < collectionCount; i++) {
    const name = readOsuString(cursor)
    const beatmapCount = readInt32(cursor)
    if (beatmapCount < 0) {
      throw new Error(`Invalid collection.db format: negative beatmap count in collection ${name}`)
    }
    const beatmapMd5s: string[] = []
    for (let j = 0; j < beatmapCount; j++) {
      const md5 = readOsuString(cursor).trim().toLowerCase()
      if (md5) beatmapMd5s.push(md5)
    }
    collections.push({ name: name || `Collection ${i + 1}`, beatmapMd5s })
  }

  return collections
}
