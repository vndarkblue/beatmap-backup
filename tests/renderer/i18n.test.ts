import { describe, it, expect } from 'vitest'
import en from '../../src/renderer/src/i18n/locales/en.json'
import vi from '../../src/renderer/src/i18n/locales/vi.json'
import ja from '../../src/renderer/src/i18n/locales/ja.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      Object.assign(result, flattenKeys(val as Record<string, unknown>, fullKey))
    } else {
      result[fullKey] = String(val)
    }
  }
  return result
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{[a-zA-Z0-9_]+\}/g)
  return matches ? [...new Set(matches)].sort() : []
}

describe('i18n locales consistency', () => {
  const flatEn = flattenKeys(en)
  const flatVi = flattenKeys(vi)
  const flatJa = flattenKeys(ja)

  it('en, vi, and ja have the exact same keys', () => {
    const enKeys = Object.keys(flatEn).sort()
    const viKeys = Object.keys(flatVi).sort()
    const jaKeys = Object.keys(flatJa).sort()

    expect(viKeys).toEqual(enKeys)
    expect(jaKeys).toEqual(enKeys)
  })

  it('all keys have non-empty strings', () => {
    for (const [key, value] of Object.entries(flatEn)) {
      expect(value.trim(), `EN key "${key}" is empty`).not.toBe('')
    }
    for (const [key, value] of Object.entries(flatVi)) {
      expect(value.trim(), `VI key "${key}" is empty`).not.toBe('')
    }
    for (const [key, value] of Object.entries(flatJa)) {
      expect(value.trim(), `JA key "${key}" is empty`).not.toBe('')
    }
  })

  it('placeholders match between en, vi, and ja', () => {
    for (const [key, enText] of Object.entries(flatEn)) {
      const enPlaceholders = extractPlaceholders(enText)
      const viPlaceholders = extractPlaceholders(flatVi[key] || '')
      const jaPlaceholders = extractPlaceholders(flatJa[key] || '')

      expect(viPlaceholders, `VI placeholders mismatch for key "${key}"`).toEqual(enPlaceholders)
      expect(jaPlaceholders, `JA placeholders mismatch for key "${key}"`).toEqual(enPlaceholders)
    }
  })
})
