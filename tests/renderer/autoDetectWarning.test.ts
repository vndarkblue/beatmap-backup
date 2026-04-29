import { describe, expect, it } from 'vitest'
import { shouldShowAutoDetectWarning } from '../../src/renderer/src/utils/autoDetectWarning'

describe('shouldShowAutoDetectWarning', () => {
  it('returns true only for explicit showWarning=true', () => {
    expect(shouldShowAutoDetectWarning({ showWarning: true })).toBe(true)
    expect(shouldShowAutoDetectWarning({ showWarning: false })).toBe(false)
    expect(shouldShowAutoDetectWarning(null)).toBe(false)
  })
})
