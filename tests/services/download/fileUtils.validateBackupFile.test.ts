import { describe, expect, it } from 'vitest'
import { validateBackupFile } from '../../../src/services/download/fileUtils'

const VALID_HEADER = `# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: 2026-01-01
# Total beatmaps: 3
# Source: test
`

describe('validateBackupFile', () => {
  it('accepts valid backup content', () => {
    const content = `${VALID_HEADER}
123
456
789
`

    expect(() => validateBackupFile(content)).not.toThrow()
  })

  it('throws when required metadata is missing', () => {
    const missingSource = `# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: 2026-01-01
# Total beatmaps: 1
123
`

    expect(() => validateBackupFile(missingSource)).toThrow(/Missing # Source:/)
  })

  it('collects all invalid IDs and reports a summary counter', () => {
    const content = `${VALID_HEADER}
123
abc
45x
789
-1
`

    expect(() => validateBackupFile(content)).toThrow(
      /Invalid beatmapset IDs \(3\/5\): abc, 45x, -1/
    )
  })
})
