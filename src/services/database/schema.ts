export const CURRENT_SCHEMA_VERSION = 1

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS beatmapsets (
  id INTEGER PRIMARY KEY,
  artist TEXT NOT NULL,
  artist_unicode TEXT NOT NULL,
  title TEXT NOT NULL,
  title_unicode TEXT NOT NULL,
  creator TEXT NOT NULL,
  source TEXT NOT NULL,
  tags TEXT NOT NULL,
  status TEXT NOT NULL,
  bpm REAL NOT NULL DEFAULT 0,
  ranked_date TEXT NULL,
  submitted_date TEXT NULL,
  last_updated TEXT NULL,
  genre_id INTEGER NULL,
  language_id INTEGER NULL,
  rating REAL NULL,
  spotlight INTEGER NOT NULL DEFAULT 0,
  video INTEGER NOT NULL DEFAULT 0,
  storyboard INTEGER NOT NULL DEFAULT 0,
  is_scoreable INTEGER NOT NULL DEFAULT 1,
  source_origin TEXT NOT NULL,
  last_synced_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS beatmaps (
  rowid INTEGER PRIMARY KEY AUTOINCREMENT,
  id INTEGER NULL,
  beatmapset_id INTEGER NOT NULL,
  md5 TEXT NOT NULL UNIQUE,
  mode INTEGER NOT NULL,
  mode_name TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT NOT NULL,
  difficulty_rating REAL NOT NULL DEFAULT 0,
  total_length INTEGER NOT NULL DEFAULT 0,
  hit_length INTEGER NOT NULL DEFAULT 0,
  bpm REAL NOT NULL DEFAULT 0,
  cs REAL NOT NULL DEFAULT 0,
  ar REAL NOT NULL DEFAULT 0,
  hp REAL NOT NULL DEFAULT 0,
  od REAL NOT NULL DEFAULT 0,
  max_combo INTEGER NULL,
  playcount INTEGER NULL,
  passcount INTEGER NULL,
  source_origin TEXT NOT NULL,
  last_synced_at INTEGER NOT NULL,
  FOREIGN KEY (beatmapset_id) REFERENCES beatmapsets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_beatmaps_beatmapset_id ON beatmaps(beatmapset_id);
CREATE INDEX IF NOT EXISTS idx_beatmaps_mode ON beatmaps(mode);
CREATE INDEX IF NOT EXISTS idx_beatmaps_status ON beatmaps(status);
CREATE INDEX IF NOT EXISTS idx_beatmaps_difficulty ON beatmaps(difficulty_rating);
CREATE INDEX IF NOT EXISTS idx_beatmaps_bpm ON beatmaps(bpm);
CREATE INDEX IF NOT EXISTS idx_beatmaps_total_length ON beatmaps(total_length);

CREATE INDEX IF NOT EXISTS idx_beatmapsets_status ON beatmapsets(status);
CREATE INDEX IF NOT EXISTS idx_beatmapsets_creator ON beatmapsets(creator);
CREATE INDEX IF NOT EXISTS idx_beatmapsets_artist ON beatmapsets(artist);
CREATE INDEX IF NOT EXISTS idx_beatmapsets_title ON beatmapsets(title);
`

