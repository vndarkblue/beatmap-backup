export type ApiDateTime = string

export type Ruleset = 'osu' | 'taiko' | 'fruits' | 'mania'

export type BeatmapStatus =
  | 'graveyard'
  | 'wip'
  | 'pending'
  | 'ranked'
  | 'approved'
  | 'qualified'
  | 'loved'

export interface User {
  id: number
  username: string
}

export interface BeatmapOwner {
  id: number
  username: string
}

export interface Beatmap {
  beatmapset_id: number
  difficulty_rating: number
  id: number
  mode: Ruleset
  status: BeatmapStatus
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
  deleted_at: ApiDateTime | null
  drain: number
  hit_length: number
  is_scoreable: boolean
  last_updated: ApiDateTime
  mode_int: number
  passcount?: number
  playcount?: number
  ranked: number
  url: string
  checksum: string
  current_user_tag_ids: number[]
  max_combo: number | null
  owners: BeatmapOwner[]
  top_tag_ids: number[]
}

export interface BeatmapsetNomination {
  beatmapset_id: number
  rulesets: Ruleset[] | null
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

export interface Beatmapset {
  artist: string
  artist_unicode: string
  beatmaps: Beatmap[]
  bpm: number
  converts: Beatmap[]
  creator: string
  current_nominations: BeatmapsetNomination[]
  deleted_at: ApiDateTime | null
  description: BeatmapsetDescription
  genre: BeatmapsetGenre
  genre_id: number
  id: number
  is_scoreable: boolean
  language: BeatmapsetLanguage
  language_id: number
  last_updated: ApiDateTime
  pack_tags: string[]
  preview_url: string
  ranked: number
  ranked_date: ApiDateTime | null
  rating: number
  related_tags: BeatmapsetTag[]
  related_users: User[]
  source: string
  spotlight: boolean
  status: BeatmapStatus
  storyboard: boolean
  submitted_date: ApiDateTime
  tags: string
  title: string
  title_unicode: string
  track_id: number | null
  user: User
  user_id: number
  version_count: number
  video: boolean
}
