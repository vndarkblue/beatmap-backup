import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveExistingPathWithinRoot, safeJoinWithinRoot, validateRelativeSubPath } from './pathGuards'

// Lightweight spec file for manual smoke testing.
// Run with a TS runtime (e.g. tsx) when needed.
export async function runPathGuardSpecs(): Promise<void> {
  assert.equal(validateRelativeSubPath('Songs').valid, true)
  assert.equal(validateRelativeSubPath('Songs\\Sub').valid, true)

  assert.equal(validateRelativeSubPath('../Songs').valid, false)
  assert.equal(validateRelativeSubPath('..\\Songs').valid, false)
  assert.equal(validateRelativeSubPath('Songs/*').valid, false)
  assert.equal(validateRelativeSubPath('Songs?.db').valid, false)

  const okJoin = safeJoinWithinRoot('C:\\osu', 'Songs')
  assert.equal(okJoin.valid, true)
  assert.equal(Boolean(okJoin.joinedPath), true)

  const escaped = safeJoinWithinRoot('C:\\osu', '..\\Windows')
  assert.equal(escaped.valid, false)

  // Symlink traversal hardening is relevant for Unix-like filesystems.
  if (process.platform !== 'win32') {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'path-guard-'))
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'path-guard-outside-'))
    const symlinkName = 'linked-outside'
    const symlinkPath = path.join(tempRoot, symlinkName)

    try {
      await fs.symlink(outsideDir, symlinkPath, 'dir')
      const resolved = await resolveExistingPathWithinRoot(tempRoot, symlinkName)
      assert.equal(resolved.valid, false)
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true })
      await fs.rm(outsideDir, { recursive: true, force: true })
    }
  }
}
