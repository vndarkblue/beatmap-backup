export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, exp)).toFixed(exp === 0 ? 0 : 2)} ${units[exp]}`
}

export interface EstimateFormatOptions {
  backupOnlineIds: boolean
  backupLocalBeatmaps: boolean
  onlineCount?: number
  estimatedBytes?: number
  localCount?: number | null
}

export type TranslateFn = (key: string, named?: Record<string, unknown>) => string

export function formatEstimateMessage(options: EstimateFormatOptions, t: TranslateFn): string {
  const estimateParts: string[] = []
  if (options.backupOnlineIds && options.onlineCount != null) {
    estimateParts.push(
      t('backup.onlineEstimate', {
        count: options.onlineCount,
        size: formatBytes(options.estimatedBytes ?? 0)
      })
    )
  }
  if (options.backupLocalBeatmaps && options.localCount != null) {
    estimateParts.push(t('backup.localEstimate', { count: options.localCount }))
  }
  return estimateParts.length > 0
    ? t('backup.estimatePrefix', { details: estimateParts.join(' · ') })
    : ''
}
