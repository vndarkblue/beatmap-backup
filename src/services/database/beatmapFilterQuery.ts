import Database from 'better-sqlite3'

/** UI mode chip values → `beatmaps.mode_name` */
const UI_MODE_TO_DB: Record<string, string> = {
  osu: 'osu',
  taiko: 'taiko',
  catch: 'fruits',
  mania: 'mania'
}

function escapeWildcards(raw: string): string {
  return raw.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/**
 * Mỗi token: OR trên các field metadata chưa bị filter riêng ghi đè.
 * Nhiều token: OR với nhau (khớp một trong các từ là đủ).
 * Sử dụng hàm custom NORMALIZE_TEXT trong SQLite để tìm kiếm không dấu và không phân biệt hoa thường.
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
  const useTags = !(parsed.tags ?? []).some((x) => typeof x === 'string' && x.trim())

  const tokenSqlParts: string[] = []
  const tokenParams: unknown[] = []

  for (const rawTok of tokens) {
    const tok = escapeWildcards(rawTok.trim())
    if (!tok) continue

    const parts: string[] = []
    const params: unknown[] = []

    if (useArtist) {
      parts.push(
        "(NORMALIZE_TEXT(s.artist) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.artist_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\')"
      )
      params.push(tok, tok)
    }
    if (useTitle) {
      parts.push(
        "(NORMALIZE_TEXT(s.title) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.title_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\')"
      )
      params.push(tok, tok)
    }
    if (useCreator) {
      parts.push("NORMALIZE_TEXT(s.creator) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
      params.push(tok)
    }
    if (useSource) {
      parts.push("NORMALIZE_TEXT(s.source) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
      params.push(tok)
    }
    if (useTags) {
      parts.push("NORMALIZE_TEXT(s.tags) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
      params.push(tok)
    }

    // Match Difficulty / Version name
    parts.push("NORMALIZE_TEXT(b.version) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
    params.push(tok)

    // Match numeric ID against beatmap_id or beatmapset_id (osu!lazer number catch-all)
    const trimmedTok = rawTok.trim()
    if (/^\d{1,10}$/.test(trimmedTok)) {
      const numVal = parseInt(trimmedTok, 10)
      if (!isNaN(numVal) && numVal > 0) {
        parts.push('(b.id = ? OR s.id = ?)')
        params.push(numVal, numVal)
      }
    }

    if (parts.length === 0) continue

    tokenSqlParts.push(`(${parts.join(' OR ')})`)
    tokenParams.push(...params)
  }

  if (tokenSqlParts.length === 0) return null

  return {
    sql: `(${tokenSqlParts.join(' AND ')})`,
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
  useDrainLength?: boolean
  genre?: string
  language?: string
  source?: string
  tags?: string[]
  /** Tìm kiếm chung: các từ cách nhau bởi khoảng trắng; OR giữa các từ; OR giữa các field chưa bị filter riêng */
  generalSearch?: string
  sortBy?:
    | 'title'
    | 'artist'
    | 'difficulty'
    | 'ranked'
    | 'stars'
    | 'bpm'
    | 'length'
    | 'version'
    | 'relevance'
  sortOrder?: 'asc' | 'desc'
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

/** Which stats apply per UI mode */
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
  if (!Array.isArray(o.lengthRange) || o.lengthRange.length !== 2) return null

  return {
    modes: o.modes.filter((m): m is string => typeof m === 'string'),
    status: o.status,
    modeStats: o.modeStats as Record<string, StatRanges>,
    artist: typeof o.artist === 'string' ? o.artist : '',
    title: typeof o.title === 'string' ? o.title : '',
    creator: typeof o.creator === 'string' ? o.creator : '',
    lengthRange: [Number(o.lengthRange[0]), Number(o.lengthRange[1])],
    useDrainLength: typeof o.useDrainLength === 'boolean' ? o.useDrainLength : false,
    genre: typeof o.genre === 'string' ? o.genre : 'any',
    language: typeof o.language === 'string' ? o.language : 'any',
    source: typeof o.source === 'string' ? o.source : '',
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === 'string') : [],
    generalSearch: typeof o.generalSearch === 'string' ? o.generalSearch : '',
    sortBy:
      o.sortBy === 'title' ||
      o.sortBy === 'artist' ||
      o.sortBy === 'difficulty' ||
      o.sortBy === 'ranked' ||
      o.sortBy === 'stars' ||
      o.sortBy === 'bpm' ||
      o.sortBy === 'length' ||
      o.sortBy === 'version' ||
      o.sortBy === 'relevance'
        ? o.sortBy
        : 'title',
    sortOrder: o.sortOrder === 'desc' ? 'desc' : 'asc',
    page: typeof o.page === 'number' ? o.page : 1,
    pageSize: typeof o.pageSize === 'number' ? o.pageSize : 25
  }
}

function buildFilterWhereClause(parsed: BeatmapFilterRequestBody): {
  whereSql: string
  params: unknown[]
} {
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

  where.push('b.total_length BETWEEN ? AND ?')
  params.push(parsed.lengthRange[0], parsed.lengthRange[1])

  const artist = (parsed.artist ?? '').trim()
  if (artist) {
    const escaped = escapeWildcards(artist)
    where.push(
      "(NORMALIZE_TEXT(s.artist) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.artist_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\')"
    )
    params.push(escaped, escaped)
  }

  const title = (parsed.title ?? '').trim()
  if (title) {
    const escaped = escapeWildcards(title)
    where.push(
      "(NORMALIZE_TEXT(s.title) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.title_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\')"
    )
    params.push(escaped, escaped)
  }

  const creator = (parsed.creator ?? '').trim()
  if (creator) {
    const escaped = escapeWildcards(creator)
    where.push("NORMALIZE_TEXT(s.creator) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
    params.push(escaped)
  }

  const source = (parsed.source ?? '').trim()
  if (source) {
    const escaped = escapeWildcards(source)
    where.push("NORMALIZE_TEXT(s.source) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
    params.push(escaped)
  }

  for (const tag of parsed.tags ?? []) {
    const t = tag.trim()
    if (!t) continue
    const escaped = escapeWildcards(t)
    where.push("NORMALIZE_TEXT(s.tags) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\'")
    params.push(escaped)
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
  return { whereSql, params }
}

export function getFilteredBeatmapsetIds(db: Database.Database, rawBody: unknown): number[] {
  const parsed = parseFilterBody(rawBody)
  if (!parsed) return []
  const { whereSql, params } = buildFilterWhereClause(parsed)
  const sql = `
    SELECT DISTINCT b.beatmapset_id AS id
    FROM beatmaps b
    INNER JOIN beatmapsets s ON s.id = b.beatmapset_id
    ${whereSql}
    ORDER BY b.beatmapset_id ASC
  `
  const rows = db.prepare(sql).all(...params) as { id: number }[]
  return rows.map((r) => r.id).filter((id) => typeof id === 'number' && id > 0)
}

function buildRelevanceOrderBy(parsed: BeatmapFilterRequestBody): {
  orderBySql: string
  orderParams: unknown[]
} {
  const rawSearch = (parsed.generalSearch ?? '').trim()
  if (!rawSearch) {
    return {
      orderBySql: `b.difficulty_rating DESC, b.beatmapset_id DESC, b.version ASC, b.id ASC`,
      orderParams: []
    }
  }

  const orderParams: unknown[] = []
  const scoreParts: string[] = []

  const escapedPhrase = escapeWildcards(rawSearch)

  // 0. Exact match Beatmap ID or BeatmapSet ID (+200)
  if (/^\d{1,10}$/.test(rawSearch)) {
    const numVal = parseInt(rawSearch, 10)
    if (!isNaN(numVal) && numVal > 0) {
      scoreParts.push(`(CASE WHEN b.id = ? OR s.id = ? THEN 200 ELSE 0 END)`)
      orderParams.push(numVal, numVal)
    }
  }

  // 1. Exact match Title (+100)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.title) = NORMALIZE_TEXT(?) OR NORMALIZE_TEXT(s.title_unicode) = NORMALIZE_TEXT(?) THEN 100 ELSE 0 END)`
  )
  orderParams.push(rawSearch, rawSearch)

  // 2. Exact match Artist (+90)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.artist) = NORMALIZE_TEXT(?) OR NORMALIZE_TEXT(s.artist_unicode) = NORMALIZE_TEXT(?) THEN 90 ELSE 0 END)`
  )
  orderParams.push(rawSearch, rawSearch)

  // 3. Prefix match Title (+70)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.title) LIKE NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.title_unicode) LIKE NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 70 ELSE 0 END)`
  )
  orderParams.push(escapedPhrase, escapedPhrase)

  // 4. Prefix match Artist (+60)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.artist) LIKE NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.artist_unicode) LIKE NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 60 ELSE 0 END)`
  )
  orderParams.push(escapedPhrase, escapedPhrase)

  // 5. Contains Phrase Title (+50)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.title) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.title_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 50 ELSE 0 END)`
  )
  orderParams.push(escapedPhrase, escapedPhrase)

  // 6. Contains Phrase Artist (+40)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.artist) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.artist_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 40 ELSE 0 END)`
  )
  orderParams.push(escapedPhrase, escapedPhrase)

  // 7. Contains Phrase Creator (+30)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(s.creator) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 30 ELSE 0 END)`
  )
  orderParams.push(escapedPhrase)

  // 8. Exact match Version / Diff (+40)
  scoreParts.push(`(CASE WHEN NORMALIZE_TEXT(b.version) = NORMALIZE_TEXT(?) THEN 40 ELSE 0 END)`)
  orderParams.push(rawSearch)

  // 9. Contains Phrase Version / Diff (+25)
  scoreParts.push(
    `(CASE WHEN NORMALIZE_TEXT(b.version) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 25 ELSE 0 END)`
  )
  orderParams.push(escapedPhrase)

  // 10. Tokens scoring if multiple tokens
  const tokens = rawSearch.split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length > 1) {
    for (const tok of tokens) {
      const escapedTok = escapeWildcards(tok)

      if (/^\d{1,10}$/.test(tok)) {
        const numVal = parseInt(tok, 10)
        if (!isNaN(numVal) && numVal > 0) {
          scoreParts.push(`(CASE WHEN b.id = ? OR s.id = ? THEN 100 ELSE 0 END)`)
          orderParams.push(numVal, numVal)
        }
      }

      scoreParts.push(
        `(CASE WHEN NORMALIZE_TEXT(s.title) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.title_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 15 ELSE 0 END)`
      )
      orderParams.push(escapedTok, escapedTok)

      scoreParts.push(
        `(CASE WHEN NORMALIZE_TEXT(s.artist) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.artist_unicode) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 12 ELSE 0 END)`
      )
      orderParams.push(escapedTok, escapedTok)

      scoreParts.push(
        `(CASE WHEN NORMALIZE_TEXT(s.creator) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 8 ELSE 0 END)`
      )
      orderParams.push(escapedTok)

      scoreParts.push(
        `(CASE WHEN NORMALIZE_TEXT(b.version) = NORMALIZE_TEXT(?) THEN 15 ELSE 0 END)`
      )
      orderParams.push(tok)

      scoreParts.push(
        `(CASE WHEN NORMALIZE_TEXT(b.version) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 6 ELSE 0 END)`
      )
      orderParams.push(escapedTok)

      scoreParts.push(
        `(CASE WHEN NORMALIZE_TEXT(s.tags) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' OR NORMALIZE_TEXT(s.source) LIKE '%' || NORMALIZE_TEXT(?) || '%' ESCAPE '\\' THEN 2 ELSE 0 END)`
      )
      orderParams.push(escapedTok, escapedTok)
    }
  }

  const scoreSql = `(${scoreParts.join(' + ')})`
  return {
    orderBySql: `${scoreSql} DESC, b.difficulty_rating DESC, b.beatmapset_id DESC, b.version ASC, b.id ASC`,
    orderParams
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

  const { whereSql, params } = buildFilterWhereClause(parsed)
  const order = parsed.sortOrder === 'asc' ? 'ASC' : 'DESC'
  let orderBySql: string
  let orderParams: unknown[] = []

  if (parsed.sortBy === 'relevance') {
    const rel = buildRelevanceOrderBy(parsed)
    orderBySql = rel.orderBySql
    orderParams = rel.orderParams
  } else {
    switch (parsed.sortBy) {
      case 'title':
        orderBySql = `LOWER(s.title) ${order}, LOWER(s.artist) ${order}, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
      case 'artist':
        orderBySql = `LOWER(s.artist) ${order}, LOWER(s.title) ${order}, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
      case 'version':
        orderBySql = `LOWER(b.version) ${order}, b.difficulty_rating ${order}, b.beatmapset_id ASC, b.id ASC`
        break
      case 'bpm':
        orderBySql = `b.bpm ${order}, b.difficulty_rating DESC, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
      case 'length':
        orderBySql = `b.total_length ${order}, b.difficulty_rating DESC, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
      case 'ranked':
        orderBySql = `s.ranked_date ${order}, b.difficulty_rating DESC, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
      case 'difficulty':
      case 'stars':
        orderBySql = `b.difficulty_rating ${order}, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
      default:
        orderBySql = `LOWER(s.title) ${order}, LOWER(s.artist) ${order}, b.beatmapset_id ASC, b.version ASC, b.id ASC`
        break
    }
  }

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
    .all(...params, ...orderParams, pageSize, offset) as BeatmapFilterRow[]
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
