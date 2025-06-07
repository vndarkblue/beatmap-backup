import Realm from 'realm'
import { getOsuLazerPath } from './settingsStore'
import path from 'path'
import fs from 'fs'

// Define interface for BeatmapSet
interface BeatmapSet {
  ID: Realm.BSON.UUID
  OnlineID: number
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
      const realmConfig: Realm.Configuration = {
        path: realmPath,
        schema: [BeatmapSetSchema],
        readOnly: true,
        schemaVersion: 48
      }
      console.log('REALM CONFIG BEFORE OPEN:', JSON.stringify(realmConfig))

      realm = await Realm.open(realmConfig)

      const beatmapsets = realm.objects<BeatmapSet>('BeatmapSet')
      const beatmapsetIds = new Set<number>()

      for (const beatmapset of beatmapsets) {
        const onlineId = beatmapset.OnlineID
        if (Number.isInteger(onlineId) && onlineId > 0) {
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
