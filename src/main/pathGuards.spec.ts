import assert from 'node:assert/strict'
import { safeJoinWithinRoot, validateRelativeSubPath } from './pathGuards'

// Lightweight spec file for manual smoke testing.
// Run with a TS runtime (e.g. tsx) when needed.
export function runPathGuardSpecs(): void {
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
}
