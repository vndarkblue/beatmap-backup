export interface BeatmapMirror {
  name: string
  baseUrl: string
  webUrl: string
  healthUrl: string
  supportsNoVideo?: boolean
  getDownloadUrl: (beatmapsetId: string, noVideo: boolean) => string
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
    healthUrl: 'https://api.nerinyan.moe/health',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://api.nerinyan.moe/d/${beatmapsetId}${noVideo ? '?noVideo=true' : ''}`
  },
  {
    name: 'Mino (chimu)',
    baseUrl: 'https://catboy.best/d/',
    webUrl: 'https://catboy.best/',
    healthUrl: 'https://catboy.best/api/',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://catboy.best/d/${beatmapsetId}${noVideo ? 'n' : ''}`
  },
  {
    name: 'Nekoha',
    baseUrl: 'https://mirror.nekoha.moe/api4/download/',
    webUrl: 'https://mirror.nekoha.moe/',
    healthUrl: 'https://mirror.nekoha.moe/api4/',
    supportsNoVideo: false,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) => {
      void noVideo
      return `https://mirror.nekoha.moe/api4/${beatmapsetId}`
    }
  },
  {
    name: 'BeatConnect',
    baseUrl: 'https://beatconnect.io/b/',
    webUrl: 'https://beatconnect.io',
    healthUrl: 'https://beatconnect.io/',
    supportsNoVideo: true,
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://beatconnect.io/b/${beatmapsetId}${noVideo ? '?novideo=1' : ''}`
  }
]
