import Database from 'better-sqlite3'

/** UI mode chip values → `beatmaps.mode_name` */
const UI_MODE_TO_DB: Record<string, string> = {
  osu: 'osu',
  taiko: 'taiko',
  catch: 'fruits',
  mania: 'mania'
}

const GENRE_KEY_TO_ID: Record<string, number> = {
  unspecified: 1,
  videoGame: 2,
  anime: 3,
  rock: 4,
  pop: 5,
  other: 6,
  novelty: 7,
  hipHop: 9,
  electronic: 10,
  metal: 11,
  classical: 12,
  folk: 13,
  jazz: 14
}

const LANGUAGE_KEY_TO_ID: Record<string, number> = {
  unspecified: 1,
  english: 2,
  japanese: 3,
  chinese: 4,
  instrumental: 5,
  korean: 6,
  french: 7,
  german: 8,
  swedish: 9,
  spanish: 10,
  italian: 11,
  russian: 12,
  polish: 13,
  other: 14
}

/** osu! API–style labels for matching general-search tokens against `genre_id` */
const GENRE_ID_TO_LABEL: Record<number, string> = {
  1: 'unspecified',
  2: 'video game',
  3: 'anime',
  4: 'rock',
  5: 'pop',
  6: 'other',
  7: 'novelty',
  9: 'hip hop',
  10: 'electronic',
  11: 'metal',
  12: 'classical',
  13: 'folk',
  14: 'jazz'
}

/** osu! API–style labels for matching general-search tokens against `language_id` */
const LANGUAGE_ID_TO_LABEL: Record<number, string> = {
  1: 'unspecified',
  2: 'english',
  3: 'japanese',
  4: 'chinese',
  5: 'instrumental',
  6: 'korean',
  7: 'french',
  8: 'german',
  9: 'swedish',
  10: 'spanish',
  11: 'italian',
  12: 'russian',
  13: 'polish',
  14: 'other'
}

function genreIdsMatchingToken(token: string): number[] {
  const t = token.toLowerCase()
  if (!t) return []
  const ids: number[] = []
  for (const [idStr, label] of Object.entries(GENRE_ID_TO_LABEL)) {
    const L = label.toLowerCase()
    if (L.includes(t)) {
      ids.push(Number(idStr))
      continue
    }
    if (L.split(/[\s-]+/).some((w) => w.includes(t) || (t.length >= 2 && w.startsWith(t)))) {
      ids.push(Number(idStr))
    }
  }
  return ids
}

function languageIdsMatchingToken(token: string): number[] {
  const t = token.toLowerCase()
  if (!t) return []
  const ids: number[] = []
  for (const [idStr, label] of Object.entries(LANGUAGE_ID_TO_LABEL)) {
    const L = label.toLowerCase()
    if (L.includes(t)) {
      ids.push(Number(idStr))
      continue
    }
    if (L.split(/[\s-]+/).some((w) => w.includes(t) || (t.length >= 2 && w.startsWith(t)))) {
      ids.push(Number(idStr))
    }
  }
  return ids
}

function likePattern(raw: string): string {
  return `%${raw.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
}

/**
 * Mỗi token: OR trên các field metadata chưa bị filter riêng ghi đè.
 * Nhiều token: OR với nhau (khớp một trong các từ là đủ).
 */
function buildGeneralSearchClause(
  parsed: BeatmapFilterRequestBody,
  tokens: string[]
): { sql: string; params: unknown[] } | null {
  if (tokens.length === 0) return null

  const useArtist = !(parsed.artist ?? '').trim()
  const useTitle = !(parsed.title ?? '').trim()
  const useCreator = !(parsed.creator ?? '').trim()
  const useSource = !(parsed.source ?? '').trim()
  const useGenre = parsed.genre === 'any'
  const useLanguage = parsed.language === 'any'
  const useTags = !((parsed.tags ?? []).some((x) => typeof x === 'string' && x.trim()))

  const tokenSqlParts: string[] = []
  const tokenParams: unknown[] = []

  for (const rawTok of tokens) {
    const tok = rawTok.trim()
    if (!tok) continue

    const like = likePattern(tok)
    const parts: string[] = []
    const params: unknown[] = []

    if (useArtist) {
      parts.push(
        '(LOWER(s.artist) LIKE LOWER(?) ESCAPE \'\\\' OR LOWER(s.artist_unicode) LIKE LOWER(?) ESCAPE \'\\\')'
      )
      params.push(like, like)
    }
    if (useTitle) {
      parts.push(
        '(LOWER(s.title) LIKE LOWER(?) ESCAPE \'\\\' OR LOWER(s.title_unicode) LIKE LOWER(?) ESCAPE \'\\\')'
      )
      params.push(like, like)
    }
    if (useCreator) {
      parts.push('LOWER(s.creator) LIKE LOWER(?) ESCAPE \'\\\'')
      params.push(like)
    }
    if (useSource) {
      parts.push('LOWER(s.source) LIKE LOWER(?) ESCAPE \'\\\'')
      params.push(like)
    }
    if (useTags) {
      parts.push('LOWER(s.tags) LIKE LOWER(?) ESCAPE \'\\\'')
      params.push(like)
    }

    if (useGenre) {
      const gids = genreIdsMatchingToken(tok)
      if (gids.length > 0) {
        parts.push(`s.genre_id IN (${gids.map(() => '?').join(',')})`)
        params.push(...gids)
      }
    }

    if (useLanguage) {
      const lids = languageIdsMatchingToken(tok)
      if (lids.length > 0) {
        parts.push(`s.language_id IN (${lids.map(() => '?').join(',')})`)
        params.push(...lids)
      }
    }

    if (parts.length === 0) continue

    tokenSqlParts.push(`(${parts.join(' OR ')})`)
    tokenParams.push(...params)
  }

  if (tokenSqlParts.length === 0) return null

  return {
    sql: `(${tokenSqlParts.join(' OR ')})`,
    params: tokenParams
  }
}

type StatRanges = {
  stars: [number, number]
  bpm: [number, number]
  cs: [number, number]
  ar: [number, number]
  hp: [number, number]
  od: [number, number]
}

export type BeatmapFilterRequestBody = {
  modes: string[]
  status: string
  modeStats: Record<string, StatRanges>
  artist?: string
  title?: string
  creator?: string
  lengthRange: [number, number]
  useDrainLength: boolean
  genre: string
  language: string
  source?: string
  tags?: string[]
  /** Tìm kiếm chung: các từ cách nhau bởi khoảng trắng; OR giữa các từ; OR giữa các field chưa bị filter riêng */
  generalSearch?: string
  sortBy?: 'title' | 'artist' | 'difficulty' | 'ranked'
  page?: number
  pageSize?: number
}

export type BeatmapFilterRow = {
  md5: string
  beatmapId: number | null
  beatmapsetId: number
  artist: string
  artistUnicode: string
  title: string
  titleUnicode: string
  creator: string
  version: string
  modeInt: number
  modeName: string
  stars: number
  bpm: number
  cs: number
  ar: number
  hp: number
  od: number
  maxCombo: number | null
  totalLengthSec: number
  hitLengthSec: number
  lengthSec: number
  status: string
  playcount: number | null
  passcount: number | null
  source: string
  tags: string
  genreId: number | null
  languageId: number | null
  rating: number | null
  spotlight: number
  video: number
  storyboard: number
  isScoreable: number
  rankedDate: string | null
  submittedDate: string | null
  lastUpdated: string | null
  sourceOrigin: string
}

export type BeatmapFilterResult = {
  beatmapCount: number
  beatmapsetCount: number
  durationMs: number
  page: number
  pageSize: number
  rows: BeatmapFilterRow[]
}

const DEFAULT_STATS: StatRanges = {
  stars: [0, 15],
  bpm: [0, 500],
  cs: [0, 10],
  ar: [0, 10],
  hp: [0, 10],
  od: [0, 10]
}

const STAT_COLUMN: Record<keyof StatRanges, string> = {
  stars: 'difficulty_rating',
  bpm: 'bpm',
  cs: 'cs',
  ar: 'ar',
  hp: 'hp',
  od: 'od'
}

/** Which stats apply per UI mode (matches BeatmapFilter.vue statConfigs showIn) */
const STAT_SHOW_IN: Record<keyof StatRanges, string[]> = {
  stars: ['osu', 'taiko', 'catch', 'mania'],
  bpm: ['osu', 'taiko', 'catch', 'mania'],
  cs: ['osu', 'catch', 'mania'],
  ar: ['osu', 'catch'],
  hp: ['osu', 'taiko', 'catch', 'mania'],
  od: ['osu', 'taiko', 'catch', 'mania']
}

function statusClause(status: string): { sql: string; params: unknown[] } | null {
  switch (status) {
    case 'any':
      return null
    case 'hasLeaderboard':
      return {
        sql: `b.status IN ('ranked', 'loved', 'approved', 'qualified')`,
        params: []
      }
    case 'unranked':
      return {
        sql: `b.status IN ('pending', 'wip', 'graveyard', 'unranked')`,
        params: []
      }
    default:
      return { sql: 'b.status = ?', params: [status] }
  }
}

function buildModeOrClause(
  modes: string[],
  modeStats: Record<string, StatRanges>
): { sql: string; params: unknown[] } {
  const effective = modes.length > 0 ? modes : ['osu', 'taiko', 'catch', 'mania']
  const parts: string[] = []
  const params: unknown[] = []

  for (const mode of effective) {
    const dbMode = UI_MODE_TO_DB[mode]
    if (!dbMode) continue

    const stats = modeStats[mode] ?? DEFAULT_STATS
    const sub: string[] = ['b.mode_name = ?']
    params.push(dbMode)

    for (const key of Object.keys(STAT_COLUMN) as (keyof StatRanges)[]) {
      if (!STAT_SHOW_IN[key].includes(mode)) continue
      const col = STAT_COLUMN[key]
      const [lo, hi] = stats[key]
      sub.push(`b.${col} BETWEEN ? AND ?`)
      params.push(lo, hi)
    }
    parts.push(`(${sub.join(' AND ')})`)
  }

  if (parts.length === 0) {
    return { sql: '(1=1)', params: [] }
  }
  return { sql: `(${parts.join(' OR ')})`, params }
}

function parseFilterBody(body: unknown): BeatmapFilterRequestBody | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  if (!Array.isArray(o.modes) || typeof o.status !== 'string' || typeof o.modeStats !== 'object')
    return null
  if (
    !Array.isArray(o.lengthRange) ||
    o.lengthRange.length !== 2 ||
    typeof o.useDrainLength !== 'boolean' ||
    typeof o.genre !== 'string' ||
    typeof o.language !== 'string'
  )
    return null

  return {
    modes: o.modes.filter((m): m is string => typeof m === 'string'),
    status: o.status,
    modeStats: o.modeStats as Record<string, StatRanges>,
    artist: typeof o.artist === 'string' ? o.artist : '',
    title: typeof o.title === 'string' ? o.title : '',
    creator: typeof o.creator === 'string' ? o.creator : '',
    lengthRange: [Number(o.lengthRange[0]), Number(o.lengthRange[1])],
    useDrainLength: o.useDrainLength,
    genre: o.genre,
    language: o.language,
    source: typeof o.source === 'string' ? o.source : '',
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    generalSearch: typeof o.generalSearch === 'string' ? o.generalSearch : '',
    sortBy:
      o.sortBy === 'title' || o.sortBy === 'artist' || o.sortBy === 'difficulty' || o.sortBy === 'ranked'
        ? o.sortBy
        : 'difficulty',
    page: typeof o.page === 'number' ? o.page : 1,
    pageSize: typeof o.pageSize === 'number' ? o.pageSize : 50
  }
}

export function runBeatmapFilter(db: Database.Database, rawBody: unknown): BeatmapFilterResult {
  const parsed = parseFilterBody(rawBody)
  if (!parsed) {
    throw new Error('Invalid filter body')
  }

  const page = Math.max(1, Math.floor(parsed.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.floor(parsed.pageSize ?? 50)))
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const params: unknown[] = []

  const modeClause = buildModeOrClause(parsed.modes, parsed.modeStats)
  where.push(modeClause.sql)
  params.push(...modeClause.params)

  const st = statusClause(parsed.status)
  if (st) {
    where.push(st.sql)
    params.push(...st.params)
  }

  const lenCol = parsed.useDrainLength ? 'b.hit_length' : 'b.total_length'
  where.push(`${lenCol} BETWEEN ? AND ?`)
  params.push(parsed.lengthRange[0], parsed.lengthRange[1])

  const artist = (parsed.artist ?? '').trim()
  if (artist) {
    const like = `%${artist.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    where.push(
      '(LOWER(s.artist) LIKE LOWER(?) ESCAPE \'\\\' OR LOWER(s.artist_unicode) LIKE LOWER(?) ESCAPE \'\\\')'
    )
    params.push(like, like)
  }

  const title = (parsed.title ?? '').trim()
  if (title) {
    const like = `%${title.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    where.push(
      '(LOWER(s.title) LIKE LOWER(?) ESCAPE \'\\\' OR LOWER(s.title_unicode) LIKE LOWER(?) ESCAPE \'\\\')'
    )
    params.push(like, like)
  }

  const creator = (parsed.creator ?? '').trim()
  if (creator) {
    const like = `%${creator.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    where.push('LOWER(s.creator) LIKE LOWER(?) ESCAPE \'\\\'')
    params.push(like)
  }

  const source = (parsed.source ?? '').trim()
  if (source) {
    const like = `%${source.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    where.push('LOWER(s.source) LIKE LOWER(?) ESCAPE \'\\\'')
    params.push(like)
  }

  if (parsed.genre !== 'any') {
    const gid = GENRE_KEY_TO_ID[parsed.genre]
    if (gid !== undefined) {
      where.push('s.genre_id = ?')
      params.push(gid)
    }
  }

  if (parsed.language !== 'any') {
    const lid = LANGUAGE_KEY_TO_ID[parsed.language]
    if (lid !== undefined) {
      where.push('s.language_id = ?')
      params.push(lid)
    }
  }

  for (const tag of parsed.tags ?? []) {
    const t = tag.trim()
    if (!t) continue
    const like = `%${t.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    where.push('LOWER(s.tags) LIKE LOWER(?) ESCAPE \'\\\'')
    params.push(like)
  }

  const generalTokens = (parsed.generalSearch ?? '')
    .trim()
    .split(/\s+/)
    .filter((x) => x.length > 0)
  const generalClause = buildGeneralSearchClause(parsed, generalTokens)
  if (generalClause) {
    where.push(generalClause.sql)
    params.push(...generalClause.params)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const orderBySql = (() => {
    switch (parsed.sortBy) {
      case 'title':
        return 'LOWER(s.title) ASC, LOWER(s.artist) ASC, b.beatmapset_id ASC, b.version ASC'
      case 'artist':
        return 'LOWER(s.artist) ASC, LOWER(s.title) ASC, b.beatmapset_id ASC, b.version ASC'
      case 'ranked':
        return 's.ranked_date DESC, b.difficulty_rating DESC, b.beatmapset_id ASC, b.version ASC'
      case 'difficulty':
      default:
        return 'b.difficulty_rating DESC, b.beatmapset_id ASC, b.version ASC'
    }
  })()

  const countSql = `
    SELECT COUNT(*) AS c,
           COUNT(DISTINCT b.beatmapset_id) AS sets
    FROM beatmaps b
    INNER JOIN beatmapsets s ON s.id = b.beatmapset_id
    ${whereSql}
  `

  const dataSql = `
    SELECT
      b.md5 AS md5,
      b.id AS beatmapId,
      b.beatmapset_id AS beatmapsetId,
      s.artist AS artist,
      s.artist_unicode AS artistUnicode,
      s.title AS title,
      s.title_unicode AS titleUnicode,
      s.creator AS creator,
      b.version AS version,
      b.mode AS modeInt,
      b.mode_name AS modeName,
      b.difficulty_rating AS stars,
      b.bpm AS bpm,
      b.cs AS cs,
      b.ar AS ar,
      b.hp AS hp,
      b.od AS od,
      b.max_combo AS maxCombo,
      b.total_length AS totalLengthSec,
      b.hit_length AS hitLengthSec,
      ${parsed.useDrainLength ? 'b.hit_length' : 'b.total_length'} AS lengthSec,
      b.status AS status,
      b.playcount AS playcount,
      b.passcount AS passcount,
      s.source AS source,
      s.tags AS tags,
      s.genre_id AS genreId,
      s.language_id AS languageId,
      s.rating AS rating,
      s.spotlight AS spotlight,
      s.video AS video,
      s.storyboard AS storyboard,
      s.is_scoreable AS isScoreable,
      s.ranked_date AS rankedDate,
      s.submitted_date AS submittedDate,
      s.last_updated AS lastUpdated,
      b.source_origin AS sourceOrigin
    FROM beatmaps b
    INNER JOIN beatmapsets s ON s.id = b.beatmapset_id
    ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT ? OFFSET ?
  `

  const t0 = Date.now()
  const countRow = db.prepare(countSql).get(...params) as { c: number; sets: number }
  const rows = db
    .prepare(dataSql)
    .all(...params, pageSize, offset) as BeatmapFilterRow[]
  const durationMs = Date.now() - t0

  return {
    beatmapCount: countRow.c,
    beatmapsetCount: countRow.sets,
    durationMs,
    page,
    pageSize,
    rows
  }
}

export { parseFilterBody }
