import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { atomicWriteFile } from '../../src/utils/fileUtils'

describe('atomicWriteFile', () => {
  it('writes content atomically to target file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'))
    const targetFile = path.join(tempDir, 'subfolder', 'test-file.bbak')
    const content = '# Beatmap Backup File\n123\n456'

    await atomicWriteFile(targetFile, content)

    expect(fs.existsSync(targetFile)).toBe(true)
    const readContent = fs.readFileSync(targetFile, 'utf-8')
    expect(readContent).toBe(content)

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('overwrites existing file without leaving temp file on success', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'))
    const targetFile = path.join(tempDir, 'existing.bbak')

    await atomicWriteFile(targetFile, 'initial content')
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe('initial content')

    await atomicWriteFile(targetFile, 'updated content')
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe('updated content')

    // Ensure no .tmp files left in the directory
    const files = fs.readdirSync(tempDir)
    expect(files).toEqual(['existing.bbak'])

    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
