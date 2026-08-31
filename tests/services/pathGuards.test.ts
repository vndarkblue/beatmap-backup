import { describe, it, expect } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  validateRelativeSubPath,
  safeJoinWithinRoot,
  resolveExistingPathWithinRoot
} from '../../src/main/pathGuards'

describe('pathGuards', () => {
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
