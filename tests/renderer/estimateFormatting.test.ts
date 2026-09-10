import { describe, it, expect } from 'vitest'
import en from '../../src/renderer/src/i18n/locales/en.json'
import vi from '../../src/renderer/src/i18n/locales/vi.json'
import ja from '../../src/renderer/src/i18n/locales/ja.json'

describe('estimate formatting consistency', () => {
  const locales = [
    { name: 'en', data: en },
    { name: 'vi', data: vi },
    { name: 'ja', data: ja }
  ]

  it.each(locales)('formats correctly when only offline beatmapsets is selected in $name', ({ data }) => {
    const localPart = data.backup.localEstimate.replace('{count}', '20')
    const formatted = data.backup.estimatePrefix.replace('{details}', localPart)

    expect(formatted).not.toContain('·')
    expect(formatted).toContain('20')
    // Must contain the prefix (Estimated output / Ước tính / 推定出力)
    expect(formatted.startsWith(data.backup.estimatePrefix.split('{details}')[0])).toBe(true)
  })

  it.each(locales)('formats correctly when both online and offline are selected in $name', ({ data }) => {
    const onlinePart = data.backup.onlineEstimate
      .replace('{count}', '12133')
      .replace('{size}', '91.31 KB')
    const localPart = data.backup.localEstimate.replace('{count}', '20')
    const details = [onlinePart, localPart].join(' · ')
    const formatted = data.backup.estimatePrefix.replace('{details}', details)

    expect(formatted).toContain('12133')
    expect(formatted).toContain('91.31 KB')
    expect(formatted).toContain(' · ')
    expect(formatted).toContain('20')
    expect(formatted.startsWith(data.backup.estimatePrefix.split('{details}')[0])).toBe(true)
  })

  it.each(locales)('formats correctly when only online beatmapsets is selected in $name', ({ data }) => {
    const onlinePart = data.backup.onlineEstimate
      .replace('{count}', '12133')
      .replace('{size}', '91.31 KB')
    const formatted = data.backup.estimatePrefix.replace('{details}', onlinePart)

    expect(formatted).not.toContain('·')
    expect(formatted).toContain('12133')
    expect(formatted).toContain('91.31 KB')
    expect(formatted.startsWith(data.backup.estimatePrefix.split('{details}')[0])).toBe(true)
  })
})
