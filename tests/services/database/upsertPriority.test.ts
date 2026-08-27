import { describe, expect, it } from 'vitest'
import {
  CREATE_TABLES_SQL,
  CREATE_INDEXES_SQL,
  CURRENT_SCHEMA_VERSION
} from '../../../src/services/database/schema'

describe('Database Schema and SQL Conflict Rules', () => {
  it('defines schema version 3 with metrics_source column', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3)
    expect(CREATE_TABLES_SQL).toContain("metrics_source TEXT NOT NULL DEFAULT 'stable'")
    expect(CREATE_TABLES_SQL).toContain('source_origin TEXT NOT NULL')
  })

  it('includes proper indexes for performance', () => {
    expect(CREATE_INDEXES_SQL).toContain('idx_beatmaps_beatmapset_id')
    expect(CREATE_INDEXES_SQL).toContain('idx_collection_map_cache_status')
  })
})
