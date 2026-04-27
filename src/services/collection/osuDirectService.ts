import fetch from 'node-fetch'

export interface OsuDirectMd5Response {
  ParentSetID?: number
  BeatmapID?: number
}

export interface ResolvedMd5Info {
  beatmapId: number | null
  beatmapsetId: number | null
}

const OSU_DIRECT_MD5_URL = 'https://osu.direct/api/md5'

export async function resolveMd5FromOsuDirect(md5: string): Promise<ResolvedMd5Info | null> {
  const response = await fetch(`${OSU_DIRECT_MD5_URL}/${encodeURIComponent(md5)}`, {
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error(`osu.direct request failed (${response.status})`)
  }

  const payload = (await response.json()) as OsuDirectMd5Response
  const beatmapsetId =
    typeof payload.ParentSetID === 'number' && payload.ParentSetID > 0 ? payload.ParentSetID : null
  const beatmapId =
    typeof payload.BeatmapID === 'number' && payload.BeatmapID > 0 ? payload.BeatmapID : null

  if (!beatmapsetId && !beatmapId) {
    return null
  }

  return { beatmapId, beatmapsetId }
}
