import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  formatEstimateMessage,
  type TranslateFn
} from '../../src/renderer/src/utils/estimateFormatting'
import en from '../../src/renderer/src/i18n/locales/en.json'
import vi from '../../src/renderer/src/i18n/locales/vi.json'
import ja from '../../src/renderer/src/i18n/locales/ja.json'

function createTranslator(localeData: Record<string, unknown>): TranslateFn {
  return (key: string, named?: Record<string, unknown>): string => {
    const parts = key.split('.')
    let current: unknown = localeData
    for (const part of parts) {
      if (typeof current === 'object' && current !== null && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return key
      }
    }
    if (typeof current !== 'string') return key
    let result = current
    if (named) {
      for (const [k, v] of Object.entries(named)) {
        result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return result
  }
}

describe('estimateFormatting', () => {
  describe('formatBytes', () => {
    it('formats boundary and regular byte sizes correctly', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(-10)).toBe('0 B')
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(1024)).toBe('1.00 KB')
      expect(formatBytes(93501)).toBe('91.31 KB')
      expect(formatBytes(1048576 * 5.5)).toBe('5.50 MB')
      expect(formatBytes(1073741824 * 2)).toBe('2.00 GB')
    })
  })

  describe('formatEstimateMessage across all locales', () => {
    const locales = [
      { name: 'en', t: createTranslator(en) },
      { name: 'vi', t: createTranslator(vi) },
      { name: 'ja', t: createTranslator(ja) }
    ]

    it.each(locales)(
      'formats correctly when only offline beatmaps are selected in $name',
      ({ t }) => {
        const message = formatEstimateMessage(
          {
            backupOnlineIds: false,
            backupLocalBeatmaps: true,
            localCount: 20
          },
          t
        )

        expect(message).not.toBe('')
        expect(message).toContain('20')
        expect(message).not.toContain('·')
      }
    )

    it.each(locales)(
      'formats correctly when only online beatmaps are selected in $name',
      ({ t }) => {
        const message = formatEstimateMessage(
          {
            backupOnlineIds: true,
            backupLocalBeatmaps: false,
            onlineCount: 12133,
            estimatedBytes: 93501
          },
          t
        )

        expect(message).not.toBe('')
        expect(message).toContain('12133')
        expect(message).toContain('91.31 KB')
        expect(message).not.toContain('·')
      }
    )

    it.each(locales)(
      'formats correctly when both online and offline are selected in $name',
      ({ t }) => {
        const message = formatEstimateMessage(
          {
            backupOnlineIds: true,
            backupLocalBeatmaps: true,
            onlineCount: 12133,
            estimatedBytes: 93501,
            localCount: 20
          },
          t
        )

        expect(message).toContain('12133')
        expect(message).toContain('91.31 KB')
        expect(message).toContain(' · ')
        expect(message).toContain('20')
      }
    )

    it('returns empty string when no options are selected or counts are missing', () => {
      const t = createTranslator(en)
      expect(
        formatEstimateMessage(
          {
            backupOnlineIds: false,
            backupLocalBeatmaps: false
          },
          t
        )
      ).toBe('')

      expect(
        formatEstimateMessage(
          {
            backupOnlineIds: true,
            backupLocalBeatmaps: false,
            onlineCount: undefined
          },
          t
        )
      ).toBe('')
    })
  })
})
