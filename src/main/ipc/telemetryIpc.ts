import { ipcMain } from 'electron'
import TelemetryService from '../../services/telemetryService'

export function registerTelemetryIpc(): () => void {
  const channels = ['telemetry:track-event']

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

  ipcMain.handle(
    'telemetry:track-event',
    async (_event, eventName: unknown, properties?: unknown): Promise<{ success: boolean }> => {
      if (typeof eventName !== 'string' || !eventName.trim()) {
        return { success: false }
      }

      const validProps: Record<string, string | number | boolean> = {}
      if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
        for (const [key, value] of Object.entries(properties)) {
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            validProps[key] = value
          }
        }
      }

      TelemetryService.getInstance().trackEvent(eventName, validProps)
      return { success: true }
    }
  )

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
