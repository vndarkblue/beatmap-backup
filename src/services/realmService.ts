import Realm from 'realm'
import { getOsuLazerPath } from './settingsStore'
import path from 'path'
import fs from 'fs'

// Define interface for BeatmapSet
interface BeatmapSet {
  ID: Realm.BSON.UUID
  OnlineID?: number | null
}

// Define the schema for BeatmapSet class
const BeatmapSetSchema = {
  name: 'BeatmapSet',
  primaryKey: 'ID',
  properties: {
    ID: 'uuid',
    OnlineID: 'int'
  }
}

function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

export const realmService = {
  getRealmSchemaVersion(): number {
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

    try {
      // Returns -1 if the file does not exist. We validated above so should be >= 0
      const version = Realm.schemaVersion(realmPath)
      return version
    } catch (error) {
      // Surface a friendlier message but keep original error in logs
      console.error('Failed to read Realm schema version:', error)
      throw new Error('Unable to read schema version from osu!lazer Realm database.')
    }
  },
  
  async getBeatmapsetIds(): Promise<number[]> {
    const osuLazerPath = getOsuLazerPath()
    if (!osuLazerPath) {
      throw new Error('Osu lazer path not set. Please set it in Settings.')
    }

    let realmPath = path.join(osuLazerPath, 'client.realm')
    if (!fs.existsSync(realmPath)) {
      realmPath = path.join(osuLazerPath, 'files', 'client.realm') // Thư mục con 'files' phổ biến hơn
      if (!fs.existsSync(realmPath)) {
        throw new Error(
          `client.realm file not found in '${osuLazerPath}' or in its 'files' subdirectory. Please ensure the path is correct or the file exists.`
        )
      }
    }

    let realm: Realm | null = null
    try {
      // Detect actual on-disk schema version to avoid mismatch
      const onDiskSchemaVersion = Realm.schemaVersion(realmPath)
      console.log('osu!lazer realm schema version:', onDiskSchemaVersion)

      // Open in dynamic, read-only mode. Not providing `schema` allows using the file's own schema.
      // Not providing `schemaVersion` prevents version mismatch errors for read-only access.
      
      const realmConfig: Realm.Configuration = {
        path: realmPath,
        readOnly: true
      }
      console.log('REALM CONFIG BEFORE OPEN:', JSON.stringify(realmConfig))

      realm = await Realm.open(realmConfig)

      // Determine the correct object type dynamically to be resilient to upstream renames
      const realmSchema = realm.schema as Array<{
        name: string
        properties?: Record<string, unknown>
      }>
      let targetTypeName: string | undefined = realmSchema.find(
        (s) => s.name === 'BeatmapSet'
      )?.name
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

      const beatmapsets = realm.objects<BeatmapSet>(targetTypeName)
      const beatmapsetIds = new Set<number>()

      for (const beatmapset of beatmapsets) {
        // Handle cases where OnlineID might be optional/null in newer schemas
        const onlineId = (beatmapset as unknown as { OnlineID?: unknown }).OnlineID
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
  }
}
