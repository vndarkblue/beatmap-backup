export interface BeatmapMirror {
  name: string
  baseUrl: string
  webUrl: string
  healthUrl: string
  getDownloadUrl: (beatmapsetId: string, noVideo: boolean) => string
}

export const DefaultBeatmapMirrors: BeatmapMirror[] = [
  {
    name: 'osu.direct',
    baseUrl: 'https://osu.direct/api/d/',
    webUrl: 'https://osu.direct/',
    healthUrl: 'https://osu.direct/api/status/',
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://osu.direct/api/d/${beatmapsetId}${noVideo ? '?noVideo' : ''}`
  },
  {
    name: 'NeriNyan',
    baseUrl: 'https://api.nerinyan.moe/d/',
    webUrl: 'https://nerinyan.moe/',
    healthUrl: 'https://api.nerinyan.moe/health',
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://api.nerinyan.moe/d/${beatmapsetId}${noVideo ? '?noVideo=true' : ''}`
  },
  {
    name: 'BeatConnect',
    baseUrl: 'https://beatconnect.io/b/',
    webUrl: 'https://beatconnect.io',
    healthUrl: 'https://beatconnect.io/',
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://beatconnect.io/b/${beatmapsetId}${noVideo ? '?novideo=1' : ''}`
  },
  {
    name: 'Mino (chimu)',
    baseUrl: 'https://catboy.best/d/',
    webUrl: 'https://catboy.best/',
    healthUrl: 'https://catboy.best/api/',
    getDownloadUrl: (beatmapsetId: string, noVideo: boolean) =>
      `https://catboy.best/d/${beatmapsetId}${noVideo ? 'n' : ''}`
  }
]
