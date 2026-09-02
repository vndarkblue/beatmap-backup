import {
  detectLazerPath,
  detectStablePath,
  isLazerPathValid,
  isStablePathValid,
  probeLazerPath,
  probeStablePath,
  type LazerProbeResult,
  type StableProbeResult,
  type OsPlatform
} from './pathAutoDetect'
import * as settingsStore from './settingsStore'

type SettingsAccessor = {
  getOsuStablePath(): string
  getOsuLazerPath(): string
  setOsuStablePath(path: string): void
  setOsuLazerPath(path: string): void
  setOsuStableSongsPath?(path: string): void
  setOsuLazerResolvedDataPath?(path: string): void
  getAutoDetectWarningDismissed(): boolean
  setAutoDetectWarningDismissed(dismissed: boolean): void
}

type AutoDetectDeps = {
  settings: SettingsAccessor
  detectStablePath: () => string | null
  detectLazerPath: () => string | null
  isStablePathValid: (value: string) => boolean
  isLazerPathValid: (value: string) => boolean
  probeStablePath?: (value: string) => StableProbeResult
  probeLazerPath?: (value: string) => LazerProbeResult
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
    isLazerPathValid,
    probeStablePath,
    probeLazerPath
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

  let effectiveStablePath = stablePath
  let effectiveLazerPath = lazerPath

  if (!stableValid) {
    const detectedStablePath = deps.detectStablePath()
    if (detectedStablePath) {
      deps.settings.setOsuStablePath(detectedStablePath)
      effectiveStablePath = detectedStablePath
      didUpdateStablePath = true
    }
  }

  if (!lazerValid) {
    const detectedLazerPath = deps.detectLazerPath()
    if (detectedLazerPath) {
      deps.settings.setOsuLazerPath(detectedLazerPath)
      effectiveLazerPath = detectedLazerPath
      didUpdateLazerPath = true
    }
  }

  // Update resolved paths in settings store if valid
  if (deps.probeStablePath && (stableValid || didUpdateStablePath) && effectiveStablePath) {
    const stableProbe = deps.probeStablePath(effectiveStablePath)
    if (stableProbe.valid && stableProbe.songsPath && deps.settings.setOsuStableSongsPath) {
      deps.settings.setOsuStableSongsPath(stableProbe.songsPath)
    }
  }

  if (deps.probeLazerPath && (lazerValid || didUpdateLazerPath) && effectiveLazerPath) {
    const lazerProbe = deps.probeLazerPath(effectiveLazerPath)
    if (
      lazerProbe.valid &&
      lazerProbe.resolvedDataPath &&
      deps.settings.setOsuLazerResolvedDataPath
    ) {
      deps.settings.setOsuLazerResolvedDataPath(lazerProbe.resolvedDataPath)
    }
  }

  const detectFailed =
    (!stableValid && !didUpdateStablePath) || (!lazerValid && !didUpdateLazerPath)
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
