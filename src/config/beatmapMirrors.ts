export interface BeatmapMirror {
  name: string
  baseUrl: string
  webUrl: string
  healthUrl: string
}

export const DefaultBeatmapMirrors: BeatmapMirror[] = [
  {
    name: 'osu.direct',
    baseUrl: 'https://osu.direct/api/d/',
    webUrl: 'https://osu.direct/',
    healthUrl: 'https://osu.direct/api/status/'
  },
  {
    name: 'NeriNyan',
    baseUrl: 'https://api.nerinyan.moe/d/',
    webUrl: 'https://nerinyan.moe/',
    healthUrl: 'https://api.nerinyan.moe/health'
  },
  {
    name: 'BeatConnect',
    baseUrl: 'https://beatconnect.io/b/',
    webUrl: 'https://beatconnect.io',
    healthUrl: 'https://beatconnect.io/'
  },
  {
    name: 'Mino (chimu)',
    baseUrl: 'https://catboy.best/d/',
    webUrl: 'https://catboy.best/',
    healthUrl: 'https://catboy.best/api/'
  }
]
