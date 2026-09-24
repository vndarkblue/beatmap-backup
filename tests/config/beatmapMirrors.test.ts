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

  it('BeatConnect returns Token header and genres healthUrl when runtime token is configured', async () => {
    const { setBeatconnectRuntimeToken } = await import('../../src/config/beatmapMirrors')
    setBeatconnectRuntimeToken('patreon-token-xyz')
    const bc = DefaultBeatmapMirrors.find((m) => m.name === 'BeatConnect')
    expect(bc).toBeDefined()
    expect(bc?.getExtraHeaders?.()).toEqual({ Token: 'patreon-token-xyz' })
    expect(bc?.getHealthHeaders?.()).toEqual({ Token: 'patreon-token-xyz' })
    expect(bc?.getHealthUrl?.()).toBe('https://beatconnect.io/api/genres/')
    setBeatconnectRuntimeToken('') // cleanup
  })

  it('BeatConnect returns empty headers and docs healthUrl when no runtime token', async () => {
    const { setBeatconnectRuntimeToken } = await import('../../src/config/beatmapMirrors')
    setBeatconnectRuntimeToken('')
    const bc = DefaultBeatmapMirrors.find((m) => m.name === 'BeatConnect')
    expect(bc).toBeDefined()
    expect(bc?.getExtraHeaders?.()).toEqual({})
    expect(bc?.getHealthHeaders?.()).toEqual({})
    expect(bc?.getHealthUrl?.()).toBe('https://beatconnect.io/api/docs/')
  })

  it('gets and sets beatconnect runtime token', async () => {
    const { getBeatconnectRuntimeToken, setBeatconnectRuntimeToken } = await import(
      '../../src/config/beatmapMirrors'
    )
    setBeatconnectRuntimeToken('test-token')
    expect(getBeatconnectRuntimeToken()).toBe('test-token')
    setBeatconnectRuntimeToken('')
    expect(getBeatconnectRuntimeToken()).toBe('')
  })

  it('catboy.best returns User-Agent headers', () => {
    const catboy = DefaultBeatmapMirrors.find((m) => m.name === 'catboy.best')
    expect(catboy).toBeDefined()
    expect(catboy?.getHealthHeaders?.()).toEqual({ 'User-Agent': 'osu-beatmap-backup/1.0' })
    expect(catboy?.getExtraHeaders?.()).toEqual({ 'User-Agent': 'osu-beatmap-backup/1.0' })
  })
})
