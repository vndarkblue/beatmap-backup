import fs from 'fs'
import path from 'path'
import { getOsuStablePath } from '../settingsStore'
import { realmService } from '../realmService'
import { parseStableCollectionDb } from './stableCollectionParser'
import type {
  CollectionEntry,
  CollectionExportStats,
  CollectionMergeMode,
  CollectionPreviewItem,
  CollectionPreviewResult,
  CollectionSource
} from './types'
import { DatabaseService } from '../database/databaseService'

export interface CollectionPreviewOptions {
  stable: boolean
  lazer: boolean
  mergeMode: CollectionMergeMode
}

export interface ResolveCollectionsOptions extends CollectionPreviewOptions {
  selectedKeys: string[]
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

function normalizeMd5s(values: string[]): string[] {
  const dedup = new Set<string>()
  for (const value of values) {
    const md5 = value.trim().toLowerCase()
    if (md5) dedup.add(md5)
  }
  return Array.from(dedup)
}

function normalizeCollectionNameForMerge(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function makeCollectionKey(name: string, source: CollectionSource): string {
  return `${source}::${name}`
}

function mergeCollections(entries: CollectionEntry[]): CollectionEntry[] {
  const map = new Map<string, CollectionEntry>()
  for (const entry of entries) {
    const key = normalizeCollectionNameForMerge(entry.name)
    const found = map.get(key)
    if (!found) {
      map.set(key, {
        name: entry.name,
        beatmapMd5s: normalizeMd5s(entry.beatmapMd5s),
        source: entry.source
      })
      continue
    }
    const mergedSource: CollectionSource =
      found.source === entry.source ? found.source : 'both'
    found.source = mergedSource
    found.beatmapMd5s = normalizeMd5s([...found.beatmapMd5s, ...entry.beatmapMd5s])
  }
  return Array.from(map.values())
}

function splitCollections(entries: CollectionEntry[]): CollectionEntry[] {
  return entries.map((entry) => ({
    ...entry,
    beatmapMd5s: normalizeMd5s(entry.beatmapMd5s)
  }))
}

export function sanitizeFileName(raw: string): string {
  const withoutControls = Array.from(raw)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  const cleaned = withoutControls
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)

  const fallback = cleaned.length > 0 ? cleaned : 'collection-backup'
  if (WINDOWS_RESERVED_NAMES.has(fallback.toUpperCase())) {
    return `${fallback}_backup`
  }
  return fallback
}

function formattedDate(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}

export const collectionService = {
  async readCollections(options: CollectionPreviewOptions): Promise<CollectionEntry[]> {
    const entries: CollectionEntry[] = []

    if (options.stable) {
      const stablePath = getOsuStablePath()
      if (stablePath) {
        const collectionDbPath = path.join(stablePath, 'collection.db')
        if (fs.existsSync(collectionDbPath)) {
          const collections = parseStableCollectionDb(collectionDbPath)
          for (const collection of collections) {
            entries.push({
              name: collection.name,
              beatmapMd5s: collection.beatmapMd5s,
              source: 'stable'
            })
          }
        }
      }
    }

    if (options.lazer) {
      const collections = await realmService.getCollections()
      for (const collection of collections) {
        entries.push({
          name: collection.name,
          beatmapMd5s: collection.beatmapMd5s,
          source: 'lazer'
        })
      }
    }

    return options.mergeMode === 'merge' ? mergeCollections(entries) : splitCollections(entries)
  },

  async previewCollections(options: CollectionPreviewOptions): Promise<CollectionPreviewResult> {
    const db = DatabaseService.getInstance()
    const collections = await this.readCollections(options)
    const now = Date.now()
    const cacheUpserts = new Map<string, Parameters<typeof db.upsertCollectionMapCache>[0]>()
    const items: CollectionPreviewItem[] = collections.map((entry) => {
      let resolvedCount = 0
      let pendingCount = 0
      let apiNotFoundCount = 0
      let missingLocalCount = 0
      for (const md5 of entry.beatmapMd5s) {
        let cache = db.getCollectionMapCacheByMd5(md5)
        if (cache?.beatmapsetid) {
          resolvedCount += 1
          continue
        }

        const localBeatmapsetId = db.getBeatmapsetIdByMd5(md5)
        if (localBeatmapsetId) {
          resolvedCount += 1
          cache = {
            md5hash: md5,
            beatmapid: cache?.beatmapid ?? null,
            beatmapsetid: localBeatmapsetId,
            missing: false,
            resolveStatus: 'resolved',
            sourceHint: entry.source,
            lastCheckedAt: now
          }
          cacheUpserts.set(md5, cache)
          continue
        }

        const seededCache =
          cache ??
          ({
            md5hash: md5,
            beatmapid: null,
            beatmapsetid: null,
            missing: true,
            resolveStatus: 'pending',
            sourceHint: entry.source,
            lastCheckedAt: 0
          } as const)
        if (!cache) {
          cacheUpserts.set(md5, {
            ...seededCache
          })
        }

        if (seededCache.missing) {
          missingLocalCount += 1
        }
        if (seededCache.resolveStatus === 'notFound') {
          apiNotFoundCount += 1
        } else {
          pendingCount += 1
        }
      }
      return {
        key: makeCollectionKey(entry.name, entry.source),
        name: entry.name,
        source: entry.source,
        mapCount: entry.beatmapMd5s.length,
        resolvedCount,
        pendingCount,
        apiNotFoundCount,
        missingLocalCount
      }
    })

    if (cacheUpserts.size > 0) {
      db.upsertCollectionMapCacheBatch(Array.from(cacheUpserts.values()))
    }

    return {
      success: true,
      collections: items,
      syncStatus: {
        ...db.getCollectionSyncStats(),
        lastRunAt: Number(db.getMeta('collection_sync_last_run_at') ?? '0') || null,
        running: db.getMeta('collection_sync_running') === '1'
      }
    }
  },

  async resolveCollectionBeatmapsetIds(
    options: ResolveCollectionsOptions
  ): Promise<{ ids: number[]; stats: CollectionExportStats; defaultFileName: string }> {
    const db = DatabaseService.getInstance()
    const collections = await this.readCollections(options)
    const selected = collections.filter((entry) =>
      options.selectedKeys.includes(makeCollectionKey(entry.name, entry.source))
    )
    if (selected.length === 0) {
      return {
        ids: [],
        stats: { resolved: 0, pendingSync: 0, missingLocal: 0, apiNotFound: 0 },
        defaultFileName: `collection-backup-${formattedDate()}.bbak`
      }
    }

    const ids = new Set<number>()
    let pendingSync = 0
    let missingLocal = 0
    let apiNotFound = 0

    for (const collection of selected) {
      for (const md5 of collection.beatmapMd5s) {
        const cache = db.getCollectionMapCacheByMd5(md5)
        if (cache?.beatmapsetid) {
          ids.add(cache.beatmapsetid)
          continue
        }

        const localBeatmapsetId = db.getBeatmapsetIdByMd5(md5)
        if (localBeatmapsetId) {
          ids.add(localBeatmapsetId)
          db.upsertCollectionMapCache({
            md5hash: md5,
            beatmapid: cache?.beatmapid ?? null,
            beatmapsetid: localBeatmapsetId,
            missing: false,
            resolveStatus: 'resolved',
            sourceHint: collection.source,
            lastCheckedAt: Date.now()
          })
          continue
        }

        const status = cache?.resolveStatus ?? 'pending'
        if (status === 'notFound') {
          apiNotFound += 1
        } else {
          pendingSync += 1
        }
        missingLocal += 1
        db.upsertCollectionMapCache({
          md5hash: md5,
          beatmapid: cache?.beatmapid ?? null,
          beatmapsetid: cache?.beatmapsetid ?? null,
          missing: true,
          resolveStatus: status,
          sourceHint: collection.source,
          lastCheckedAt: cache?.lastCheckedAt ?? 0
        })
      }
    }

    const nameSeed = selected.length === 1 ? selected[0].name : 'backup'
    const defaultFileName = `${sanitizeFileName(nameSeed)}-${formattedDate()}.bbak`
    return {
      ids: Array.from(ids).sort((a, b) => a - b),
      stats: { resolved: ids.size, pendingSync, missingLocal, apiNotFound },
      defaultFileName
    }
  }
}
