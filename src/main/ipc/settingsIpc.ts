import { ipcMain } from 'electron'
import {
  getSettings,
  updateSettings,
  resetSettings,
  setOsuStableSongsPath,
  setOsuLazerResolvedDataPath,
  hasBeatconnectApiToken,
  setBeatconnectApiToken,
  type Settings as AppSettings
} from '../../services/settingsStore'
import { probeStablePath, probeLazerPath } from '../../services/pathAutoDetect'
import { validateDownloadPath } from '../../services/download/downloadTargetValidator'
import type { StartupAutoDetectResult } from '../../services/startupAutoDetect'
import type { PathValidationResult } from '../../preload/electronApiTypes'

let startupAutoDetectResult: StartupAutoDetectResult = {
  didUpdateStablePath: false,
  didUpdateLazerPath: false,
  showWarning: false
}

export function setStartupAutoDetectResult(result: StartupAutoDetectResult): void {
  startupAutoDetectResult = result
}

export function registerSettingsIpc(): () => void {
  const channels = [
    'settings:get',
    'settings:update',
    'settings:reset',
    'settings:has-beatconnect-token',
    'settings:set-beatconnect-token',
    'settings:validate-path',
    'settings:get-auto-detect-status'
  ]

  for (const ch of channels) {
    ipcMain.removeHandler(ch)
  }

  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    return getSettings()
  })

  ipcMain.handle(
    'settings:update',
    async (_event, patch: Partial<AppSettings>): Promise<{ success: boolean }> => {
      updateSettings(patch)
      return { success: true }
    }
  )

  ipcMain.handle('settings:reset', async (): Promise<{ success: boolean }> => {
    resetSettings()
    return { success: true }
  })

  ipcMain.handle('settings:has-beatconnect-token', async (): Promise<boolean> => {
    return hasBeatconnectApiToken()
  })

  ipcMain.handle(
    'settings:set-beatconnect-token',
    async (_event, token: string): Promise<{ success: boolean }> => {
      setBeatconnectApiToken(token)
      return { success: true }
    }
  )

  ipcMain.handle(
    'settings:validate-path',
    async (
      _event,
      target: 'stable' | 'lazer' | 'download',
      customPath?: string
    ): Promise<PathValidationResult> => {
      const settings = getSettings()

      if (target === 'stable') {
        const checkPath = customPath ?? settings.osuStablePath
        if (!checkPath) return { valid: false, error: 'No path set' }
        try {
          const probe = probeStablePath(checkPath)
          if (probe.valid) {
            if (probe.songsPath) {
              setOsuStableSongsPath(probe.songsPath)
            }
            return { valid: true, error: null }
          }
          return { valid: false, error: 'Invalid osu!stable directory' }
        } catch {
          return { valid: false, error: 'Path validation failed' }
        }
      }

      if (target === 'lazer') {
        const checkPath = customPath ?? settings.osuLazerPath
        if (!checkPath) return { valid: false, error: 'No path set' }
        try {
          const probe = probeLazerPath(checkPath)
          if (probe.valid) {
            if (probe.resolvedDataPath) {
              setOsuLazerResolvedDataPath(probe.resolvedDataPath)
            }
            return { valid: true, error: null }
          }
          return { valid: false, error: 'client.realm database not found' }
        } catch {
          return { valid: false, error: 'Path validation failed' }
        }
      }

      if (target === 'download') {
        const checkPath = customPath ?? settings.downloadPath
        if (!checkPath || checkPath.trim().length === 0) {
          return { valid: false, error: 'No path provided' }
        }
        try {
          await validateDownloadPath(checkPath)
          return { valid: true, error: null }
        } catch (error) {
          return {
            valid: false,
            error: error instanceof Error ? error.message : 'Path validation failed'
          }
        }
      }

      return { valid: false, error: 'Invalid validation target' }
    }
  )

  ipcMain.handle('settings:get-auto-detect-status', async (): Promise<StartupAutoDetectResult> => {
    return startupAutoDetectResult
  })

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
