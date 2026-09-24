export interface BeatmapMirror {
  name: string
  baseUrl: string
  webUrl: string
  healthUrl: string
  supportsNoVideo?: boolean
  getDownloadUrl: (beatmapsetId: string, noVideo: boolean) => string
  getExtraHeaders?: () => Record<string, string>
  getHealthHeaders?: () => Record<string, string>
  getHealthUrl?: () => string
}

let _beatconnectRuntimeToken = ''
export const BEATCONNECT_MIRROR_NAME = 'BeatConnect'

export function setBeatconnectRuntimeToken(token: string): void {
  _beatconnectRuntimeToken = token
}

export function getBeatconnectRuntimeToken(): string {
  return _beatconnectRuntimeToken
}

export const DefaultBeatmapMirrors: BeatmapMirror[] = [
  {
    name: 'osu.direct',
    baseUrl: 'https://osu.direct/api/d/',
    webUrl: 'https://osu.direct/',
    healthUrl: 'https://osu.direct/api/status/',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://osu.direct/api/d/${beatmapsetId}${noVideo ? '?noVideo' : ''}`
  },
  {
    name: 'NeriNyan',
    baseUrl: 'https://api.nerinyan.moe/d/',
    webUrl: 'https://nerinyan.moe/',
    healthUrl: 'https://nerinyan.moe/',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://api.nerinyan.moe/d/${beatmapsetId}${noVideo ? '?noVideo=true' : ''}`
  },
  {
    name: 'catboy.best',
    baseUrl: 'https://catboy.best/d/',
    webUrl: 'https://catboy.best/',
    healthUrl: 'https://catboy.best/docs',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://catboy.best/d/${beatmapsetId}${noVideo ? 'n' : ''}`,
    getHealthHeaders: () => ({ 'User-Agent': 'osu-beatmap-backup/1.0' }),
    getExtraHeaders: () => ({ 'User-Agent': 'osu-beatmap-backup/1.0' })
  },
  {
    name: 'Nekoha',
    baseUrl: 'https://mirror.nekoha.moe/api/download/',
    webUrl: 'https://mirror.nekoha.moe/',
    healthUrl: 'https://mirror.nekoha.moe/',
    // F3: Nekoha supports ?noVideo=1 query param
    supportsNoVideo: true,
    // F3: Include download/ segment matching baseUrl (/api/download/:id)
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://mirror.nekoha.moe/api/download/${beatmapsetId}${noVideo ? '?noVideo=1' : ''}`
  },
  {
    name: 'BeatConnect',
    baseUrl: 'https://beatconnect.io/b/',
    webUrl: 'https://beatconnect.io',
    healthUrl: 'https://beatconnect.io/api/docs/',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://beatconnect.io/b/${beatmapsetId}${noVideo ? '?novideo=1' : ''}`,
    getHealthUrl: () =>
      _beatconnectRuntimeToken
        ? 'https://beatconnect.io/api/genres/'
        : 'https://beatconnect.io/api/docs/',
    getHealthHeaders: (): Record<string, string> =>
      _beatconnectRuntimeToken ? { Token: _beatconnectRuntimeToken } : {},
    getExtraHeaders: (): Record<string, string> =>
      _beatconnectRuntimeToken ? { Token: _beatconnectRuntimeToken } : {}
  }
]
