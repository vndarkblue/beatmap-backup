import {
  detectLazerPath,
  detectStablePath,
  isLazerPathValid,
  isStablePathValid,
  type OsPlatform
} from './pathAutoDetect'
import * as settingsStore from './settingsStore'

type SettingsAccessor = {
  getOsuStablePath(): string
  getOsuLazerPath(): string
  setOsuStablePath(path: string): void
  setOsuLazerPath(path: string): void
  getAutoDetectWarningDismissed(): boolean
  setAutoDetectWarningDismissed(dismissed: boolean): void
}

type AutoDetectDeps = {
  settings: SettingsAccessor
  detectStablePath: () => string | null
  detectLazerPath: () => string | null
  isStablePathValid: (value: string) => boolean
  isLazerPathValid: (value: string) => boolean
}

export type StartupAutoDetectResult = {
  didUpdateStablePath: boolean
  didUpdateLazerPath: boolean
  showWarning: boolean
}

const createDefaultDeps = (platform: OsPlatform = process.platform): AutoDetectDeps => {
  return {
    settings: settingsStore,
    detectStablePath: () => detectStablePath(platform),
    detectLazerPath: () => detectLazerPath(platform),
    isStablePathValid,
    isLazerPathValid
  }
}

export function runStartupAutoDetect(depsArg?: AutoDetectDeps): StartupAutoDetectResult {
  const deps = depsArg ?? createDefaultDeps()
  const stablePath = deps.settings.getOsuStablePath()
  const lazerPath = deps.settings.getOsuLazerPath()

  const stableValid = deps.isStablePathValid(stablePath)
  const lazerValid = deps.isLazerPathValid(lazerPath)

  let didUpdateStablePath = false
  let didUpdateLazerPath = false

  if (!stableValid) {
    const detectedStablePath = deps.detectStablePath()
    if (detectedStablePath) {
      deps.settings.setOsuStablePath(detectedStablePath)
      didUpdateStablePath = true
    }
  }

  if (!lazerValid) {
    const detectedLazerPath = deps.detectLazerPath()
    if (detectedLazerPath) {
      deps.settings.setOsuLazerPath(detectedLazerPath)
      didUpdateLazerPath = true
    }
  }

  const detectFailed = (!stableValid && !didUpdateStablePath) || (!lazerValid && !didUpdateLazerPath)
  const alreadyDismissed = deps.settings.getAutoDetectWarningDismissed()
  const showWarning = detectFailed && !alreadyDismissed

  if (showWarning) {
    deps.settings.setAutoDetectWarningDismissed(true)
  }

  return {
    didUpdateStablePath,
    didUpdateLazerPath,
    showWarning
  }
}
