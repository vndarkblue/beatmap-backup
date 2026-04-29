import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import { parseStableCollectionDb } from '../../../src/services/collection/stableCollectionParser'

vi.mock('fs')

const mockedFs = vi.mocked(fs)

const encodeInt32 = (value: number): Buffer => {
  const b = Buffer.alloc(4)
  b.writeInt32LE(value, 0)
  return b
}

const encodeByte = (value: number): Buffer => Buffer.from([value & 0xff])

const encodeUleb128 = (value: number): Buffer => {
  const bytes: number[] = []
  let remaining = value >>> 0
  do {
    let byte = remaining & 0x7f
    remaining >>>= 7
    if (remaining > 0) byte |= 0x80
    bytes.push(byte)
  } while (remaining > 0)
  return Buffer.from(bytes)
}

const encodeOsuString = (value: string): Buffer => {
  if (!value) return encodeByte(0x00)
  const utf = Buffer.from(value, 'utf8')
  return Buffer.concat([encodeByte(0x0b), encodeUleb128(utf.length), utf])
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('parseStableCollectionDb', () => {
  it('parses a valid collection.db payload', () => {
    const payload = Buffer.concat([
      encodeInt32(20260101),
      encodeInt32(1),
      encodeOsuString('Favorites'),
      encodeInt32(2),
      encodeOsuString('ABCDEF'),
      encodeOsuString('123456')
    ])
    mockedFs.readFileSync.mockReturnValue(payload)

    const result = parseStableCollectionDb('/tmp/collection.db')
    expect(result).toEqual([
      {
        name: 'Favorites',
        beatmapMd5s: ['abcdef', '123456']
      }
    ])
  })

  it('includes collection index counters when beatmap count is invalid', () => {
    const payload = Buffer.concat([
      encodeInt32(20260101),
      encodeInt32(2),
      encodeOsuString('Valid'),
      encodeInt32(0),
      encodeOsuString('Broken'),
      encodeInt32(-2)
    ])
    mockedFs.readFileSync.mockReturnValue(payload)

    expect(() => parseStableCollectionDb('/tmp/collection.db')).toThrow(
      /negative beatmap count \(processed 1\/2 collections, failed at index 2\)/
    )
  })
})
