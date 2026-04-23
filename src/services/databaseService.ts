// import Database from 'better-sqlite3'
// import { Beatmapset, Beatmap } from './types/beatmapset'

// export class DatabaseService {
//   private db: Database.Database

//   constructor() {
//     this.db = new Database('beatmapsets.db')
//     this.setupDatabase()
//   }

//   private setupDatabase() {
//     // Create tables if they don't exist
//     this.db.exec(`
//       CREATE TABLE IF NOT EXISTS beatmapsets (
//         id INTEGER PRIMARY KEY,
//         artist TEXT,
//         artist_unicode TEXT,
//         title TEXT,
//         title_unicode TEXT,
//         creator TEXT,
//         source TEXT,
//         tags TEXT,
//         status TEXT,
//         bpm REAL,
//         ranked_date INTEGER,
//         submitted_date INTEGER,
//         last_updated INTEGER,
//         genre_id INTEGER,
//         language_id INTEGER,
//         rating REAL,
//         spotlight BOOLEAN,
//         video BOOLEAN,
//         storyboard BOOLEAN,
//         is_scoreable BOOLEAN
//       );

//       CREATE TABLE IF NOT EXISTS beatmaps (
//         id INTEGER PRIMARY KEY,
//         beatmapset_id INTEGER,
//         mode TEXT,
//         version TEXT,
//         difficulty_rating REAL,
//         total_length INTEGER,
//         hit_length INTEGER,
//         bpm REAL,
//         cs REAL,
//         ar REAL,
//         drain REAL,
//         accuracy REAL,
//         max_combo INTEGER,
//         playcount INTEGER,
//         passcount INTEGER,
//         FOREIGN KEY (beatmapset_id) REFERENCES beatmapsets(id)
//       );

//       CREATE TABLE IF NOT EXISTS genres (
//         id INTEGER PRIMARY KEY,
//         name TEXT
//       );

//       CREATE TABLE IF NOT EXISTS languages (
//         id INTEGER PRIMARY KEY,
//         name TEXT
//       );

//       CREATE TABLE IF NOT EXISTS tags (
//         id INTEGER PRIMARY KEY,
//         name TEXT,
//         ruleset_id INTEGER
//       );

//       CREATE TABLE IF NOT EXISTS beatmapset_tags (
//         beatmapset_id INTEGER,
//         tag_id INTEGER,
//         PRIMARY KEY (beatmapset_id, tag_id),
//         FOREIGN KEY (beatmapset_id) REFERENCES beatmapsets(id),
//         FOREIGN KEY (tag_id) REFERENCES tags(id)
//       );
//     `)

//     // Create indexes for better search performance
//     this.db.exec(`
//       CREATE INDEX IF NOT EXISTS idx_beatmapsets_title ON beatmapsets(title);
//       CREATE INDEX IF NOT EXISTS idx_beatmapsets_artist ON beatmapsets(artist);
//       CREATE INDEX IF NOT EXISTS idx_beatmapsets_creator ON beatmapsets(creator);
//       CREATE INDEX IF NOT EXISTS idx_beatmaps_difficulty ON beatmaps(difficulty_rating);
//       CREATE INDEX IF NOT EXISTS idx_beatmaps_mode ON beatmaps(mode);
//       CREATE INDEX IF NOT EXISTS idx_beatmapsets_status ON beatmapsets(status);
//     `)
//   }

//   // Basic CRUD operations
//   async addBeatmapset(beatmapset: Beatmapset): Promise<void> {
//     const stmt = this.db.prepare(`
//       INSERT INTO beatmapsets (
//         id, artist, artist_unicode, title, title_unicode, creator,
//         source, tags, status, bpm, ranked_date, submitted_date,
//         last_updated, genre_id, language_id, rating, spotlight,
//         video, storyboard, is_scoreable
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `)

//     stmt.run(
//       beatmapset.id,
//       beatmapset.artist,
//       beatmapset.artist_unicode,
//       beatmapset.title,
//       beatmapset.title_unicode,
//       beatmapset.creator,
//       beatmapset.source,
//       beatmapset.tags,
//       beatmapset.status,
//       beatmapset.bpm,
//       beatmapset.ranked_date,
//       beatmapset.submitted_date,
//       beatmapset.last_updated,
//       beatmapset.genre_id,
//       beatmapset.language_id,
//       beatmapset.rating,
//       beatmapset.spotlight,
//       beatmapset.video,
//       beatmapset.storyboard,
//       beatmapset.is_scoreable
//     )

//     // Add beatmaps
//     for (const beatmap of beatmapset.beatmaps) {
//       this.addBeatmap(beatmap)
//     }
//   }

//   private addBeatmap(beatmap: Beatmap): void {
//     const stmt = this.db.prepare(`
//       INSERT INTO beatmaps (
//         id, beatmapset_id, mode, version, difficulty_rating,
//         total_length, hit_length, bpm, cs, ar, drain,
//         accuracy, max_combo, playcount, passcount
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `)

//     stmt.run(
//       beatmap.id,
//       beatmap.beatmapset_id,
//       beatmap.mode,
//       beatmap.version,
//       beatmap.difficulty_rating,
//       beatmap.total_length,
//       beatmap.hit_length,
//       beatmap.bpm,
//       beatmap.cs,
//       beatmap.ar,
//       beatmap.drain,
//       beatmap.accuracy,
//       beatmap.max_combo,
//       beatmap.playcount,
//       beatmap.passcount
//     )
//   }

//   async getBeatmapset(id: number): Promise<Beatmapset | null> {
//     const stmt = this.db.prepare('SELECT * FROM beatmapsets WHERE id = ?')
//     const beatmapset = stmt.get(id)

//     if (!beatmapset) return null

//     // Get beatmaps for this beatmapset
//     const beatmapsStmt = this.db.prepare('SELECT * FROM beatmaps WHERE beatmapset_id = ?')
//     const beatmaps = beatmapsStmt.all(id)

//     return {
//       ...beatmapset,
//       beatmaps
//     }
//   }

//   async updateBeatmapset(beatmapset: Beatmapset): Promise<void> {
//     const stmt = this.db.prepare(`
//       UPDATE beatmapsets SET
//         artist = ?, artist_unicode = ?, title = ?, title_unicode = ?,
//         creator = ?, source = ?, tags = ?, status = ?, bpm = ?,
//         ranked_date = ?, submitted_date = ?, last_updated = ?,
//         genre_id = ?, language_id = ?, rating = ?, spotlight = ?,
//         video = ?, storyboard = ?, is_scoreable = ?
//       WHERE id = ?
//     `)

//     stmt.run(
//       beatmapset.artist,
//       beatmapset.artist_unicode,
//       beatmapset.title,
//       beatmapset.title_unicode,
//       beatmapset.creator,
//       beatmapset.source,
//       beatmapset.tags,
//       beatmapset.status,
//       beatmapset.bpm,
//       beatmapset.ranked_date,
//       beatmapset.submitted_date,
//       beatmapset.last_updated,
//       beatmapset.genre_id,
//       beatmapset.language_id,
//       beatmapset.rating,
//       beatmapset.spotlight,
//       beatmapset.video,
//       beatmapset.storyboard,
//       beatmapset.is_scoreable,
//       beatmapset.id
//     )
//   }

//   async deleteBeatmapset(id: number): Promise<void> {
//     // Delete beatmaps first due to foreign key constraint
//     const deleteBeatmaps = this.db.prepare('DELETE FROM beatmaps WHERE beatmapset_id = ?')
//     deleteBeatmaps.run(id)

//     // Then delete the beatmapset
//     const deleteBeatmapset = this.db.prepare('DELETE FROM beatmapsets WHERE id = ?')
//     deleteBeatmapset.run(id)
//   }

//   // Search methods will be implemented later based on your requirements
//   async searchBeatmapsets(params: {
//     keyword?: string
//     mode?: 'osu' | 'taiko' | 'fruits' | 'mania'
//     bpmMin?: number
//     bpmMax?: number
//     difficultyMin?: number
//     difficultyMax?: number
//     lengthMin?: number
//     lengthMax?: number
//   }): Promise<Beatmapset[]> {
//     // This will be implemented based on your specific requirements
//     return []
//   }

//   // Close database connection
//   close(): void {
//     this.db.close()
//   }
// }
