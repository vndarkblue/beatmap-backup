export type StatRanges = {
  stars: [number, number]
  bpm: [number, number]
  cs: [number, number]
  ar: [number, number]
  hp: [number, number]
  od: [number, number]
}

export const defaultStats = (): StatRanges => ({
  stars: [0, 12],
  bpm: [0, 400],
  cs: [0, 10],
  ar: [0, 10],
  hp: [0, 10],
  od: [0, 10]
})

export const defaultModeStats = (): Record<string, StatRanges> => ({
  osu: defaultStats(),
  taiko: defaultStats(),
  catch: defaultStats(),
  mania: {
    ...defaultStats(),
    cs: [1, 10]
  }
})

export type FilterRow = {
  md5: string
  beatmapId: number | null
  beatmapsetId: number
  artist: string
  artistUnicode?: string
  title: string
  titleUnicode?: string
  creator: string
  version: string
  modeInt: number
  stars: number
  bpm: number
  cs: number
  ar: number
  hp: number
  od: number
  lengthSec: number
  status: string
}

export interface ModeInfo {
  value: string
  label: string
  icon: string
}

export const GAME_MODES: readonly ModeInfo[] = [
  { value: 'osu', label: 'osu!', icon: '\uE800' },
  { value: 'taiko', label: 'Taiko', icon: '\uE803' },
  { value: 'catch', label: 'Catch', icon: '\uE801' },
  { value: 'mania', label: 'Mania', icon: '\uE802' }
] as const

export const MODE_INFO_MAP: Record<string, ModeInfo> = {
  osu: { value: 'osu', label: 'osu!', icon: '\uE800' },
  taiko: { value: 'taiko', label: 'Taiko', icon: '\uE803' },
  catch: { value: 'catch', label: 'Catch', icon: '\uE801' },
  mania: { value: 'mania', label: 'Mania', icon: '\uE802' }
}
