import Realm from 'realm'
import { getOsuLazerPath } from './settingsStore'
import path from 'path'
import fs from 'fs'

interface DynamicRealmSchema {
  name: string
  properties?: Record<string, unknown>
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

function getResolvedRealmPath(): string {
  const osuLazerPath = getOsuLazerPath()
  if (!osuLazerPath) {
    throw new Error('Osu lazer path not set. Please set it in Settings.')
  }

  let realmPath = path.join(osuLazerPath, 'client.realm')
  if (!fs.existsSync(realmPath)) {
    realmPath = path.join(osuLazerPath, 'files', 'client.realm')
    if (!fs.existsSync(realmPath)) {
      throw new Error(
        `client.realm file not found in '${osuLazerPath}' or in its 'files' subdirectory. Please ensure the path is correct or the file exists.`
      )
    }
  }
  return realmPath
}

function readProperty(object: unknown, keys: string[]): unknown {
  if (object == null) return undefined
  for (const key of keys) {
    if (typeof object === 'object' && key in (object as Record<string, unknown>)) {
      return (object as Record<string, unknown>)[key]
    }
    if (
      typeof object === 'object' &&
      object !== null &&
      Object.prototype.hasOwnProperty.call(object, key)
    ) {
      return (object as Record<string, unknown>)[key]
    }
  }
  return undefined
}

function readNestedProperty(object: unknown, pathKeys: string[]): unknown {
  let current: unknown = object
  for (const key of pathKeys) {
    if (typeof current === 'object' && current !== null && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
      continue
    }
    if (
      typeof current === 'object' &&
      current !== null &&
      Object.prototype.hasOwnProperty.call(current, key)
    ) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}

function pickObjectTypeName(schema: DynamicRealmSchema[], preferred: string): string | undefined {
  const exact = schema.find((s) => s.name === preferred)?.name
  if (exact) return exact
  return schema.find((s) => s.name.toLowerCase().includes(preferred.toLowerCase()))?.name
}

function mapRulesetToModeInt(ruleset: unknown): number {
  if (typeof ruleset === 'number') return ruleset
  if (typeof ruleset === 'string') {
    if (ruleset === 'taiko') return 1
    if (ruleset === 'fruits' || ruleset === 'catch') return 2
    if (ruleset === 'mania') return 3
    return 0
  }
  if (typeof ruleset === 'object' && ruleset !== null) {
    const onlineId = readProperty(ruleset, ['OnlineID', 'onlineID'])
    if (typeof onlineId === 'number') return onlineId
    const shortName = readProperty(ruleset, ['ShortName', 'shortName'])
    if (typeof shortName === 'string') {
      if (shortName === 'taiko') return 1
      if (shortName === 'fruits' || shortName === 'catch') return 2
      if (shortName === 'mania') return 3
      return 0
    }
  }
  return 0
}

function normalizeRankStatus(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 'unranked'
  switch (num) {
    case 4:
      return 'loved'
    case 3:
      return 'qualified'
    case 2:
      return 'approved'
    case 1:
      return 'ranked'
    case 0:
      return 'pending'
    case -1:
      return 'wip'
    case -2:
      return 'graveyard'
    default:
      return 'unranked'
  }
}

export const realmService = {
  getRealmPath(): string {
    return getResolvedRealmPath()
  },

  getRealmSchemaVersion(): number {
    const realmPath = getResolvedRealmPath()

    try {
      const version = Realm.schemaVersion(realmPath)
      return version
    } catch (error) {
      console.error('Failed to read Realm schema version:', error)
      throw new Error('Unable to read schema version from osu!lazer Realm database.')
    }
  },

  async getBeatmapsetIds(): Promise<number[]> {
    const realmPath = getResolvedRealmPath()
    let realm: Realm | null = null

    try {
      const onDiskSchemaVersion = Realm.schemaVersion(realmPath)
      console.log('osu!lazer realm schema version:', onDiskSchemaVersion)

      const realmConfig: Realm.Configuration = {
        path: realmPath,
        readOnly: true
      }
      console.log('REALM CONFIG BEFORE OPEN:', JSON.stringify(realmConfig))

      realm = await Realm.open(realmConfig)

      const realmSchema = realm.schema as DynamicRealmSchema[]
      let targetTypeName: string | undefined = pickObjectTypeName(realmSchema, 'BeatmapSet')
      if (!targetTypeName) {
        const hasOnlineId = realmSchema.find(
          (s) => s.properties && Object.prototype.hasOwnProperty.call(s.properties, 'OnlineID')
        )
        if (hasOnlineId) {
          targetTypeName = hasOnlineId.name
          console.log(
            `Selected realm object type '${targetTypeName}' by presence of OnlineID property`
          )
        }
      }
      if (!targetTypeName) {
        throw new Error(
          'Could not find a suitable object type containing OnlineID in osu!lazer Realm database. The file structure may have changed.'
        )
      }

      const beatmapsets = realm.objects(targetTypeName)
      const beatmapsetIds = new Set<number>()

      for (const beatmapset of beatmapsets) {
        const onlineId = readProperty(beatmapset, ['OnlineID', 'onlineID'])
        if (typeof onlineId === 'number' && Number.isInteger(onlineId) && onlineId > 0) {
          beatmapsetIds.add(onlineId)
        }
      }

      const sortedIds = Array.from(beatmapsetIds).sort((a, b) => a - b)
      return sortedIds
    } catch (error: unknown) {
      console.error(
        'Realm Open Error Details:',
        JSON.stringify(error, Object.getOwnPropertyNames(error))
      )
      let friendlyMessage = 'Failed to process Lazer Realm database.'
      if (isErrorWithMessage(error)) {
        const message = error.message
        if (message.includes('schema version') || message.includes('Schema version')) {
          friendlyMessage +=
            ' There might be a schema version mismatch. The app may need an update, or the Realm file structure has changed.'
        } else if (message.includes("Property 'OnlineID' must be of type 'int', got 'null'")) {
          friendlyMessage +=
            " Schema mismatch for OnlineID: Expected integer but received null. Consider changing schema to 'int?'."
        } else if (message.includes('Invalid mnemonic') || message.includes('schema mismatch')) {
          friendlyMessage +=
            ' The Realm file might be corrupted, an incorrect schema was provided, or the file structure is unexpected.'
        } else if (message.includes('No such file or directory')) {
          friendlyMessage += ` The Realm file was not found at the expected path: ${realmPath}.`
        }
      }
      throw new Error(friendlyMessage)
    } finally {
      if (realm && !realm.isClosed) {
        realm.close()
      }
    }
  },

  async getBeatmapsForDatabase(): Promise<
    Array<{
      md5: string
      beatmapId: number | null
      beatmapsetId: number | null
      modeInt: number
      ar: number
      cs: number
      hp: number
      od: number
      bpm: number
      totalLength: number
      hitLength: number
      version: string
      stars: number
      status: string
      artist: string
      artistUnicode: string
      title: string
      titleUnicode: string
      creator: string
      source: string
      tags: string
      rankedDate: string | null
      submittedDate: string | null
      video: boolean
      storyboard: boolean
    }>
  > {
    const realmPath = getResolvedRealmPath()
    const realm = await Realm.open({
      path: realmPath,
      readOnly: true
    })

    try {
      const realmSchema = realm.schema as DynamicRealmSchema[]
      const beatmapType = pickObjectTypeName(realmSchema, 'Beatmap')
      if (!beatmapType) {
        throw new Error('Could not locate Beatmap object type in osu!lazer Realm schema.')
      }

      const rows: Array<{
        md5: string
        beatmapId: number | null
        beatmapsetId: number | null
        modeInt: number
        ar: number
        cs: number
        hp: number
        od: number
        bpm: number
        totalLength: number
        hitLength: number
        version: string
        stars: number
        status: string
        artist: string
        artistUnicode: string
        title: string
        titleUnicode: string
        creator: string
        source: string
        tags: string
        rankedDate: string | null
        submittedDate: string | null
        video: boolean
        storyboard: boolean
      }> = []

      const beatmaps = realm.objects(beatmapType)
      for (const beatmap of beatmaps) {
        const md5Raw = readProperty(beatmap, ['MD5Hash', 'Hash', 'md5', 'Checksum'])
        if (typeof md5Raw !== 'string' || md5Raw.length === 0) continue

        const onlineId = readProperty(beatmap, ['OnlineID', 'ID', 'id'])
        const beatmapsetObject = readProperty(beatmap, ['BeatmapSet', 'beatmapSet'])
        const beatmapsetOnlineId =
          readNestedProperty(beatmapsetObject, ['OnlineID']) ??
          readNestedProperty(beatmapsetObject, ['ID']) ??
          readNestedProperty(beatmapsetObject, ['id'])
        const ruleset = readProperty(beatmap, ['Ruleset', 'Mode', 'mode'])
        const modeInt = mapRulesetToModeInt(ruleset)
        const difficultyObject = readProperty(beatmap, ['Difficulty', 'difficulty'])
        const metadataObject =
          readProperty(beatmap, ['Metadata', 'metadata']) ??
          readProperty(beatmapsetObject, ['Metadata', 'metadata'])
        const authorObject = readProperty(metadataObject, ['Author', 'author'])
        const beatmapStatus = readProperty(beatmap, ['Status', 'RankStatus'])
        const setStatus = readProperty(beatmapsetObject, ['Status', 'RankStatus'])

        rows.push({
          md5: md5Raw,
          beatmapId: typeof onlineId === 'number' && onlineId > 0 ? onlineId : null,
          beatmapsetId:
            typeof beatmapsetOnlineId === 'number' && beatmapsetOnlineId > 0
              ? beatmapsetOnlineId
              : null,
          modeInt,
          ar: Number(readProperty(difficultyObject, ['ApproachRate', 'AR']) ?? 0),
          cs: Number(readProperty(difficultyObject, ['CircleSize', 'CS']) ?? 0),
          hp: Number(readProperty(difficultyObject, ['DrainRate', 'HP']) ?? 0),
          od: Number(readProperty(difficultyObject, ['OverallDifficulty', 'OD']) ?? 0),
          bpm: Number(readProperty(beatmap, ['BPM', 'Bpm']) ?? 0),
          totalLength: Math.max(0, Math.floor(Number(readProperty(beatmap, ['Length', 'TotalLength']) ?? 0) / 1000)),
          hitLength: Number(readProperty(beatmap, ['HitLength']) ?? 0),
          version: String(readProperty(beatmap, ['Version', 'DifficultyName']) ?? ''),
          stars: Number(readProperty(beatmap, ['StarRating', 'Difficulty']) ?? 0),
          status: normalizeRankStatus(beatmapStatus ?? setStatus ?? 'unranked'),
          artist: String(readProperty(metadataObject, ['Artist', 'artist']) ?? ''),
          artistUnicode: String(
            readProperty(metadataObject, ['ArtistUnicode', 'artistUnicode']) ?? ''
          ),
          title: String(readProperty(metadataObject, ['Title', 'title']) ?? ''),
          titleUnicode: String(readProperty(metadataObject, ['TitleUnicode', 'titleUnicode']) ?? ''),
          creator: String(readProperty(authorObject, ['Username', 'username']) ?? ''),
          source: String(readProperty(metadataObject, ['Source', 'source']) ?? ''),
          tags: String(readProperty(metadataObject, ['Tags', 'tags']) ?? ''),
          rankedDate: (() => {
            const value = readProperty(beatmapsetObject, ['DateRanked', 'dateRanked'])
            return value instanceof Date ? value.toISOString() : value ? String(value) : null
          })(),
          submittedDate: (() => {
            const value = readProperty(beatmapsetObject, ['DateSubmitted', 'dateSubmitted'])
            return value instanceof Date ? value.toISOString() : value ? String(value) : null
          })(),
          video: Boolean(readProperty(beatmapsetObject, ['Video', 'video']) ?? false),
          storyboard: Boolean(readProperty(beatmapsetObject, ['Storyboard', 'storyboard']) ?? false)
        })
      }

      return rows
    } finally {
      if (!realm.isClosed) {
        realm.close()
      }
    }
  }
}
