import { describe, expect, it } from 'vitest'
import {
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL,
  CURRENT_SCHEMA_VERSION
} from '../../../src/services/database/schema'

describe('Database Schema DDL and Versioning', () => {
  it('defines current schema version as 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
  })

  it('defines beatmapsets and beatmaps tables with metrics_source and source_origin columns', () => {
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS beatmapsets')
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS beatmaps')
    expect(CREATE_TABLES_SQL).toContain("metrics_source TEXT NOT NULL DEFAULT 'stable'")
    expect(CREATE_TABLES_SQL).toContain('source_origin TEXT NOT NULL')
    expect(CREATE_TABLES_SQL).toContain(
      'FOREIGN KEY (beatmapset_id) REFERENCES beatmapsets(id) ON DELETE CASCADE'
    )
  })

  it('defines meta and collection_map_cache tables', () => {
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS meta')
    expect(CREATE_TABLES_SQL).toContain('CREATE TABLE IF NOT EXISTS collection_map_cache')
    expect(CREATE_TABLES_SQL).toContain('md5hash TEXT PRIMARY KEY')
    expect(CREATE_TABLES_SQL).toContain("resolve_status TEXT NOT NULL DEFAULT 'pending'")
  })

  it('includes proper indexes for search and query performance', () => {
    expect(CREATE_INDEXES_SQL).toContain('idx_beatmaps_beatmapset_id')
    expect(CREATE_INDEXES_SQL).toContain('idx_beatmaps_mode')
    expect(CREATE_INDEXES_SQL).toContain('idx_beatmaps_difficulty')
    expect(CREATE_INDEXES_SQL).toContain('idx_beatmapsets_status')
    expect(CREATE_INDEXES_SQL).toContain('idx_collection_map_cache_status')
  })
})
