import { describe, it, expect } from 'vitest'
import { DefaultBeatmapMirrors } from '../../src/config/beatmapMirrors'

describe('Beatmap Mirrors Configuration', () => {
  it('ensures each mirror has valid name, baseUrl, webUrl, healthUrl and getDownloadUrl', () => {
    expect(DefaultBeatmapMirrors.length).toBeGreaterThan(0)
    for (const mirror of DefaultBeatmapMirrors) {
      expect(mirror.name).toBeTruthy()
      expect(mirror.baseUrl).toMatch(/^https?:\/\//)
      expect(mirror.webUrl).toMatch(/^https?:\/\//)
      expect(mirror.healthUrl).toMatch(/^https?:\/\//)
      expect(typeof mirror.getDownloadUrl).toBe('function')
    }
  })

  it('ensures all mirror names are unique', () => {
    const names = DefaultBeatmapMirrors.map((m) => m.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })

  it('generates valid download URLs containing the beatmapsetId', () => {
    const setId = '123456'
    for (const mirror of DefaultBeatmapMirrors) {
      const url = mirror.getDownloadUrl(setId, false)
      expect(url).toContain(setId)
      expect(url).toMatch(/^https?:\/\//)
    }
  })

  it('appends noVideo parameter for mirrors supporting noVideo', () => {
    const setId = '99999'
    for (const mirror of DefaultBeatmapMirrors) {
      if (mirror.supportsNoVideo) {
        const urlWithNoVideo = mirror.getDownloadUrl(setId, true)
        const urlWithoutNoVideo = mirror.getDownloadUrl(setId, false)
        expect(urlWithNoVideo).not.toBe(urlWithoutNoVideo)
      }
    }
  })

  // Target requirement F3: Mino mirror should be named 'catboy.best'
  it('uses catboy.best as mirror name instead of Mino (chimu)', () => {
    const catboyMirror = DefaultBeatmapMirrors.find((m) => m.baseUrl.includes('catboy.best'))
    expect(catboyMirror).toBeDefined()
    expect(catboyMirror?.name).toBe('catboy.best')
  })

  // Target requirement F3: Nekoha supportsNoVideo should be true
  it('Nekoha mirror supports noVideo downloads', () => {
    const nekoha = DefaultBeatmapMirrors.find((m) => m.name === 'Nekoha')
    expect(nekoha).toBeDefined()
    expect(nekoha?.supportsNoVideo).toBe(true)
  })

  // Target requirement F3: Nekoha getDownloadUrl should contain download/ segment matching baseUrl
  it('Nekoha getDownloadUrl matches its baseUrl with /api/download/ segment', () => {
    const nekoha = DefaultBeatmapMirrors.find((m) => m.name === 'Nekoha')
    expect(nekoha).toBeDefined()
    const url = nekoha?.getDownloadUrl('12345', false)
    expect(url).toContain('/api/download/12345')
  })
})
