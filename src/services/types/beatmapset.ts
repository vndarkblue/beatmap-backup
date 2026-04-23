export interface Root {
  artist: string
  artist_unicode: string
  creator: string
  genre_id: number
  id: number
  language_id: number
  nsfw: boolean
  preview_url: string
  source: string
  status: string
  title: string
  title_unicode: string
  track_id: number
  user_id: number
  bpm: number
  legacy_thread_url: string
  ranked: number
  ranked_date: string
  rating: number
  storyboard: boolean
  submitted_date: string
  tags: string
  beatmaps: Beatmap[]
  converts: Convert[]
  genre: Genre
  language: Language
  pack_tags: string[]
  related_users: User[]
  related_tags: string[]
  user: User
  version_count: number
}

export interface Beatmap {
  beatmapset_id: number
  difficulty_rating: number
  id: number
  mode: string
  status: string
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
  drain: number
  hit_length: number
  mode_int: number
  ranked: number
  url: string
  checksum: string
  current_user_tag_ids: number[]
  max_combo: number
  owners: Owner[]
  top_tag_ids: number[]
}

export interface Owner {
  id: number
  username: string
}

export interface Convert {
  beatmapset_id: number
  difficulty_rating: number
  id: number
  mode: string
  status: string
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
  drain: number
  hit_length: number
  mode_int: number
  ranked: number
  url: string
  checksum: string
  owners: Owner[]
  top_tag_ids: number[]
}

export interface Genre {
  id: number
  name: string
}

export interface Language {
  id: number
  name: string
}

export interface User {
  default_group: string
  id: number
  username: string
}
