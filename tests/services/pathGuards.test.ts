import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  validateRelativeSubPath,
  safeJoinWithinRoot,
  resolveExistingPathWithinRoot,
  isValidExternalUrl,
  isSafeDirectoryToOpen,
  isSafePathToShow
} from '../../src/main/pathGuards'

describe('pathGuards', () => {
  describe('isValidExternalUrl', () => {
    it('accepts valid http and https URLs', () => {
      expect(isValidExternalUrl('https://osu.ppy.sh')).toBe(true)
      expect(isValidExternalUrl('http://example.com/test?a=1')).toBe(true)
    })

    it('rejects invalid protocols, ill-formed URLs, and non-strings', () => {
      expect(isValidExternalUrl('javascript:alert(1)')).toBe(false)
      expect(isValidExternalUrl('file:///C:/Windows/notepad.exe')).toBe(false)
      expect(isValidExternalUrl('data:text/html,<h1>hi</h1>')).toBe(false)
      expect(isValidExternalUrl('not-a-valid-url')).toBe(false)
      expect(isValidExternalUrl('')).toBe(false)
      expect(isValidExternalUrl('   ')).toBe(false)
      expect(isValidExternalUrl(null as unknown as string)).toBe(false)
      expect(isValidExternalUrl(undefined as unknown as string)).toBe(false)
      expect(isValidExternalUrl(123 as unknown as string)).toBe(false)
    })
  })

  describe('isSafeDirectoryToOpen', () => {
    it('returns true for an existing directory', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-dir-test-'))
      try {
        expect(isSafeDirectoryToOpen(tempDir)).toBe(true)
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    })

    it('returns false for files or non-existent directories', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-dir-test-'))
      const tempFile = path.join(tempDir, 'test.txt')
      await fs.writeFile(tempFile, 'hello')
      try {
        expect(isSafeDirectoryToOpen(tempFile)).toBe(false)
        expect(isSafeDirectoryToOpen(path.join(tempDir, 'non_existent'))).toBe(false)
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    })

    it('returns false for invalid or empty inputs', () => {
      expect(isSafeDirectoryToOpen('')).toBe(false)
      expect(isSafeDirectoryToOpen('   ')).toBe(false)
      expect(isSafeDirectoryToOpen(null as unknown as string)).toBe(false)
      expect(isSafeDirectoryToOpen(undefined as unknown as string)).toBe(false)
    })
  })

  describe('isSafePathToShow', () => {
    it('returns true for existing files and directories', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'safe-show-test-'))
      const tempFile = path.join(tempDir, 'file.txt')
      await fs.writeFile(tempFile, 'data')
      try {
        expect(isSafePathToShow(tempDir)).toBe(true)
        expect(isSafePathToShow(tempFile)).toBe(true)
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true })
      }
    })

    it('returns false for non-existent paths', () => {
      expect(isSafePathToShow(path.join(os.tmpdir(), 'totally_non_existent_file_xyz_123'))).toBe(
        false
      )
    })

    it('returns false for invalid or empty inputs', () => {
      expect(isSafePathToShow('')).toBe(false)
      expect(isSafePathToShow('   ')).toBe(false)
      expect(isSafePathToShow(null as unknown as string)).toBe(false)
      expect(isSafePathToShow(undefined as unknown as string)).toBe(false)
    })
  })

  describe('validateRelativeSubPath', () => {
    it('accepts valid relative subpaths', () => {
      expect(validateRelativeSubPath('Songs').valid).toBe(true)
      expect(validateRelativeSubPath('Songs/Sub').valid).toBe(true)
      expect(validateRelativeSubPath('Songs\\Sub').valid).toBe(true)
      expect(validateRelativeSubPath('deep/nested/folder/file.osz').valid).toBe(true)
    })

    it('rejects parent traversal attempts', () => {
      expect(validateRelativeSubPath('../Songs').valid).toBe(false)
      expect(validateRelativeSubPath('..\\Songs').valid).toBe(false)
      expect(validateRelativeSubPath('Songs/../Other').valid).toBe(false)
      expect(validateRelativeSubPath('Songs\\..\\Other').valid).toBe(false)
      expect(validateRelativeSubPath('..').valid).toBe(false)
    })

    it('rejects disallowed wildcard and special characters', () => {
      expect(validateRelativeSubPath('Songs/*').valid).toBe(false)
      expect(validateRelativeSubPath('Songs?.db').valid).toBe(false)
      expect(validateRelativeSubPath('Songs<test>').valid).toBe(false)
      expect(validateRelativeSubPath('Songs|pipe').valid).toBe(false)
      expect(validateRelativeSubPath('Songs"quote').valid).toBe(false)
    })

    it('rejects absolute paths', () => {
      expect(validateRelativeSubPath('/etc/passwd').valid).toBe(false)
      expect(validateRelativeSubPath('C:\\osu\\Songs').valid).toBe(false)
    })

    it('rejects empty or invalid inputs', () => {
      expect(validateRelativeSubPath('').valid).toBe(false)
      expect(validateRelativeSubPath('   ').valid).toBe(false)
      expect(validateRelativeSubPath(null as unknown as string).valid).toBe(false)
      expect(validateRelativeSubPath(undefined as unknown as string).valid).toBe(false)
    })
  })

  describe('safeJoinWithinRoot', () => {
    it('safely joins path within root directory', () => {
      const result = safeJoinWithinRoot('C:\\osu', 'Songs')
      expect(result.valid).toBe(true)
      expect(result.joinedPath).toBe(path.resolve('C:\\osu', 'Songs'))
    })

    it('rejects joining if subpath attempts to escape root', () => {
      const result = safeJoinWithinRoot('C:\\osu', '..\\Windows')
      expect(result.valid).toBe(false)
      expect(result.joinedPath).toBeUndefined()
    })

    it('rejects empty or invalid rootDir', () => {
      expect(safeJoinWithinRoot('', 'Songs').valid).toBe(false)
      expect(safeJoinWithinRoot('   ', 'Songs').valid).toBe(false)
      expect(safeJoinWithinRoot(null as unknown as string, 'Songs').valid).toBe(false)
    })
  })

  describe('resolveExistingPathWithinRoot', () => {
    it('resolves existing path within root successfully', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'path-guard-test-'))
      const subDir = 'nested'
      await fs.mkdir(path.join(tempRoot, subDir))

      try {
        const resolved = await resolveExistingPathWithinRoot(tempRoot, subDir)
        expect(resolved.valid).toBe(true)
        expect(resolved.resolvedPath).toBeDefined()
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true })
      }
    })

    it('returns valid: false for non-existent paths', async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'path-guard-test-'))
      try {
        const resolved = await resolveExistingPathWithinRoot(tempRoot, 'non_existent_subpath')
        expect(resolved.valid).toBe(false)
      } finally {
        await fs.rm(tempRoot, { recursive: true, force: true })
      }
    })

    it('returns valid: false when safeJoinWithinRoot fails', async () => {
      const resolved = await resolveExistingPathWithinRoot('', 'Songs')
      expect(resolved.valid).toBe(false)
    })

    // Symlink traversal hardening is relevant for Unix-like filesystems
    if (process.platform !== 'win32') {
      it('rejects symlink pointing outside root', async () => {
        const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'path-guard-'))
        const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'path-guard-outside-'))
        const symlinkName = 'linked-outside'
        const symlinkPath = path.join(tempRoot, symlinkName)

        try {
          await fs.symlink(outsideDir, symlinkPath, 'dir')
          const resolved = await resolveExistingPathWithinRoot(tempRoot, symlinkName)
          expect(resolved.valid).toBe(false)
        } finally {
          await fs.rm(tempRoot, { recursive: true, force: true })
          await fs.rm(outsideDir, { recursive: true, force: true })
        }
      })
    }
  })
})
