import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { atomicWriteFile } from '../../src/utils/fileUtils'

describe('atomicWriteFile', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('writes string content atomically to target file in a nested directory', async () => {
    const targetFile = path.join(tempDir, 'subfolder', 'test-file.bbak')
    const content = '# Beatmap Backup File\n123\n456'

    await atomicWriteFile(targetFile, content)

    expect(fs.existsSync(targetFile)).toBe(true)
    const readContent = fs.readFileSync(targetFile, 'utf-8')
    expect(readContent).toBe(content)
  })

  it('writes binary Buffer content atomically', async () => {
    const targetFile = path.join(tempDir, 'binary.bin')
    const buffer = Buffer.from([0x01, 0x02, 0x03, 0x04])

    await atomicWriteFile(targetFile, buffer)

    expect(fs.existsSync(targetFile)).toBe(true)
    const readBuffer = fs.readFileSync(targetFile)
    expect(readBuffer).toEqual(buffer)
  })

  it('overwrites existing file without leaving temp file on success', async () => {
    const targetFile = path.join(tempDir, 'existing.bbak')

    await atomicWriteFile(targetFile, 'initial content')
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe('initial content')

    await atomicWriteFile(targetFile, 'updated content')
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe('updated content')

    // Ensure no .tmp files left in the directory
    const files = fs.readdirSync(tempDir)
    expect(files).toEqual(['existing.bbak'])
  })

  it('cleans up temp file and rethrows error if rename fails', async () => {
    const targetFile = path.join(tempDir, 'fail.bbak')
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockRejectedValue(new Error('Disk full'))

    await expect(atomicWriteFile(targetFile, 'content')).rejects.toThrow('Disk full')

    // Verify temp file was cleaned up by the catch block
    const files = fs.readdirSync(tempDir)
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'))
    expect(tmpFiles).toHaveLength(0)

    renameSpy.mockRestore()
  })
})
