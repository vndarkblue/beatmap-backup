export interface User {
  id: number
  username: string
}

export interface BeatmapOwner {
  id: number
  username: string
}

export interface BeatmapTag {
  tag_id: number
  count: number
}

export interface Beatmap {
  beatmapset_id: number
  difficulty_rating: number
  id: number
  mode: 'osu' | 'taiko' | 'fruits' | 'mania'
  status: 'ranked' | 'qualified' | 'loved' | 'pending' | 'graveyard'
  total_length: number
  user_id: number
  version: string
  accuracy: number
  ar: number
  bpm: number
  convert: boolean
  count_circles: number
  count_sliders: number
  count_spinners: number
  cs: number
  deleted_at: number | null
  drain: number
  hit_length: number
  is_scoreable: boolean
  last_updated: number
  mode_int: number
  passcount?: number
  playcount?: number
  ranked: number
  url: string
  checksum: string
  current_user_tag_ids: number[]
  max_combo: number
  owners: BeatmapOwner[]
  top_tag_ids: BeatmapTag[]
  last_checked: number
}

export interface BeatmapsetNomination {
  beatmapset_id: number
  rulesets: string[] | null
  reset: boolean
  user_id: number
}

export interface BeatmapsetDescription {
  description: string
}

export interface BeatmapsetGenre {
  id: number
  name: string
}

export interface BeatmapsetLanguage {
  id: number
  name: string
}

export interface BeatmapsetTag {
  id: number
  name: string
  ruleset_id: number | null
  description: string
}

export class Beatmapset {
  id: number
  artist: string
  artist_unicode: string
  creator: string
  source: string
  tags: string
  title: string
  title_unicode: string
  next_update: number
  preview_url: string
  spotlight: boolean
  status: string
  track_id: number | null
  user_id: number
  video: boolean
  bpm: number
  deleted_at: number | null
  is_scoreable: boolean
  last_updated: number
  ranked: number
  ranked_date: number
  storyboard: boolean
  submitted_date: number
  beatmaps: Beatmap[]
  converts: Beatmap[]
  current_nominations: BeatmapsetNomination[]
  description: BeatmapsetDescription
  genre: BeatmapsetGenre
  language: BeatmapsetLanguage
  pack_tags: string[]
  related_users: User[]
  user: User
  last_checked: number
  rating: number
  related_tags: BeatmapsetTag[]
  genre_id: number
  language_id: number

  constructor(data: Partial<Beatmapset>) {
    this.id = data.id ?? 0
    this.artist = data.artist ?? ''
    this.artist_unicode = data.artist_unicode ?? ''
    this.creator = data.creator ?? ''
    this.source = data.source ?? ''
    this.tags = data.tags ?? ''
    this.title = data.title ?? ''
    this.title_unicode = data.title_unicode ?? ''
    this.next_update = data.next_update ?? 0
    this.preview_url = data.preview_url ?? ''
    this.spotlight = data.spotlight ?? false
    this.status = data.status ?? ''
    this.track_id = data.track_id ?? null
    this.user_id = data.user_id ?? 0
    this.video = data.video ?? false
    this.bpm = data.bpm ?? 0
    this.deleted_at = data.deleted_at ?? null
    this.is_scoreable = data.is_scoreable ?? true
    this.last_updated = data.last_updated ?? 0
    this.ranked = data.ranked ?? 0
    this.ranked_date = data.ranked_date ?? 0
    this.storyboard = data.storyboard ?? false
    this.submitted_date = data.submitted_date ?? 0
    this.beatmaps = data.beatmaps ?? []
    this.converts = data.converts ?? []
    this.current_nominations = data.current_nominations ?? []
    this.description = data.description ?? { description: '' }
    this.genre = data.genre ?? { id: 0, name: '' }
    this.language = data.language ?? { id: 0, name: '' }
    this.pack_tags = data.pack_tags ?? []
    this.related_users = data.related_users ?? []
    this.user = data.user ?? ({} as User)
    this.last_checked = data.last_checked ?? 0
    this.rating = data.rating ?? 0
    this.related_tags = data.related_tags ?? []
    this.genre_id = data.genre_id ?? 0
    this.language_id = data.language_id ?? 0
  }

  // Helper methods
  getDifficultyRange(): { min: number; max: number } {
    if (this.beatmaps.length === 0) {
      return { min: 0, max: 0 }
    }
    const difficulties = this.beatmaps.map((b) => b.difficulty_rating)
    return {
      min: Math.min(...difficulties),
      max: Math.max(...difficulties)
    }
  }
  // {0, 1, 2, 3} = {osu, taiko, fruits, mania}
  getBeatmapsByMode(mode: Beatmap['mode']): Beatmap[] {
    return this.beatmaps.filter((b) => b.mode === mode)
  }

  getBeatmapsByDifficultyRange(min: number, max: number): Beatmap[] {
    return this.beatmaps.filter((b) => b.difficulty_rating >= min && b.difficulty_rating <= max)
  }
}
