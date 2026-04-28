import { is } from '@electron-toolkit/utils'

const START_MS = Date.now()

export function startupMark(label: string, extra?: Record<string, unknown>): void {
  // Keep production logs clean by default.
  if (!is.dev) return

  const deltaMs = Date.now() - START_MS
  const suffix = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : ''
  console.log(`[startup +${deltaMs}ms] ${label}${suffix}`)
}
