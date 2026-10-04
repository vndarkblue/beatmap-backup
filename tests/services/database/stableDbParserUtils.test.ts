import { describe, it, expect, vi } from 'vitest'
import {
  parseRawStableBeatmaps,
  modeFromInt,
  statusFromRankedStatus,
  type StableBeatmap
} from '../../../src/services/database/stableDbParserUtils'

describe('stableDbParserUtils', () => {
  it('correctly maps mode numbers to strings', () => {
    expect(modeFromInt(0)).toBe('osu')
    expect(modeFromInt(1)).toBe('taiko')
    expect(modeFromInt(2)).toBe('fruits')
    expect(modeFromInt(3)).toBe('mania')
    expect(modeFromInt(99)).toBe('osu')
  })

  it('correctly maps ranked status codes to status strings', () => {
    expect(statusFromRankedStatus(4)).toBe('loved')
    expect(statusFromRankedStatus(3)).toBe('qualified')
    expect(statusFromRankedStatus(2)).toBe('approved')
    expect(statusFromRankedStatus(1)).toBe('ranked')
    expect(statusFromRankedStatus(0)).toBe('pending')
    expect(statusFromRankedStatus(-1)).toBe('wip')
    expect(statusFromRankedStatus(-2)).toBe('graveyard')
    expect(statusFromRankedStatus(99)).toBe('unranked')
  })

  it('parses raw stable beatmaps and extracts sets and normalized beatmaps', () => {
    const rawMaps: StableBeatmap[] = [
      {
        md5: 'md5_1',
        beatmapset_id: 101,
        beatmap_id: 1001,
        artist_name: 'Artist',
        song_title: 'Title',
        mode: 0,
        ranked_status: 1,
        total_time: 120000,
        drain_time: 110,
        timing_points: [[300, 0, true]]
      },
      {
        md5: 'md5_2',
        beatmapset_id: 101, // same set
        beatmap_id: 1002,
        artist_name: 'Artist',
        song_title: 'Title',
        mode: 1,
        ranked_status: 1,
        total_time: 120000,
        drain_time: 110,
        timing_points: [[300, 0, true]]
      },
      {
        md5: '', // invalid md5
        beatmapset_id: 102
      },
      {
        md5: 'md5_3',
        beatmapset_id: -1 // invalid set id
      }
    ]

    const onProgress = vi.fn()
    const result = parseRawStableBeatmaps(rawMaps, onProgress)

    expect(result.sets.length).toBe(1)
    expect(result.sets[0].id).toBe(101)
    expect(result.sets[0].artist).toBe('Artist')
    expect(result.sets[0].bpm).toBe(200)

    expect(result.beatmaps.length).toBe(2)
    expect(result.beatmaps[0].md5).toBe('md5_1')
    expect(result.beatmaps[1].md5).toBe('md5_2')

    expect(result.summary).toEqual({
      processed: 4,
      accepted: 2,
      skippedMissingMd5: 1,
      skippedInvalidBeatmapsetId: 1
    })
  })
})
