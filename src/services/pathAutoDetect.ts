import fs from 'fs'
import path from 'path'
import os from 'os'

export type OsPlatform = 'win32' | 'linux' | 'darwin' | string

export type FsProbe = {
  existsSync: (target: string) => boolean
  lstatSync: (target: string) => { isDirectory(): boolean; isFile(): boolean }
  readdirSync?: (target: string) => string[]
  readFileSync?: (target: string, encoding: BufferEncoding) => string
  statSync?: (target: string) => { mtimeMs: number }
}

export type EnvProbe = {
  homeDir: string
}

export interface StableProbeResult {
  valid: boolean
  songsPath: string | null
}

export interface LazerProbeResult {
  valid: boolean
  resolvedDataPath: string | null
  isRedirected: boolean
}

const defaultFsProbe: FsProbe = {
  existsSync: fs.existsSync,
  lstatSync: fs.lstatSync,
  readdirSync: (target: string) => fs.readdirSync(target),
  readFileSync: (target: string, encoding: BufferEncoding) => fs.readFileSync(target, encoding),
  statSync: (target: string) => fs.statSync(target)
}

const getDefaultEnvProbe = (): EnvProbe => ({
  homeDir: os.homedir()
})

function isDir(target: string, probe: FsProbe): boolean {
  try {
    return probe.existsSync(target) && probe.lstatSync(target).isDirectory()
  } catch {
    return false
  }
}

function isFile(target: string, probe: FsProbe): boolean {
  try {
    return probe.existsSync(target) && probe.lstatSync(target).isFile()
  } catch {
    return false
  }
}

function parseIniStorageFullPath(content: string): string | null {
  const lines = content.split(/\r?\n/)
  let inStorageSection = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }
    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim().toLowerCase()
      inStorageSection = section === 'storage'
      continue
    }
    if (inStorageSection) {
      const eqIdx = line.indexOf('=')
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim()
        const value = line.slice(eqIdx + 1).trim()
        if (key.toLowerCase() === 'fullpath') {
          return value || null
        }
      }
    }
  }
  return null
}

function parseCfgBeatmapDirectory(content: string): string | null {
  const lines = content.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }
    const eqIdx = line.indexOf('=')
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx).trim()
      const value = line.slice(eqIdx + 1).trim()
      if (key.toLowerCase() === 'beatmapdirectory') {
        return value || null
      }
    }
  }
  return null
}

function isPathAbsoluteOnAnyPlatform(p: string): boolean {
  return path.isAbsolute(p) || path.win32.isAbsolute(p) || path.posix.isAbsolute(p)
}

export function probeStablePath(
  stablePath: string,
  probe: FsProbe = defaultFsProbe
): StableProbeResult {
  if (!stablePath || !isDir(stablePath, probe)) {
    return { valid: false, songsPath: null }
  }

  // Stable criteria: osu!.exe + at least one of osu!.db OR osu!.*.cfg
  const exePath = path.join(stablePath, 'osu!.exe')
  const hasExe = isFile(exePath, probe)
  if (!hasExe) {
    return { valid: false, songsPath: null }
  }

  const dbPath = path.join(stablePath, 'osu!.db')
  const hasDb = isFile(dbPath, probe)

  let cfgFiles: string[] = []
  if (probe.readdirSync) {
    try {
      const entries = probe.readdirSync(stablePath)
      cfgFiles = entries.filter((entry) => /^osu!\..+\.cfg$/i.test(entry))
    } catch {
      cfgFiles = []
    }
  }

  const hasCfg = cfgFiles.length > 0
  if (!hasDb && !hasCfg) {
    return { valid: false, songsPath: null }
  }

  // Resolve Songs path from cfg if available
  let resolvedSongsPath: string | null = null

  if (hasCfg && probe.readFileSync) {
    let chosenCfg = cfgFiles[0]
    if (cfgFiles.length > 1 && probe.statSync) {
      let maxMtime = -Infinity
      for (const cfgFile of cfgFiles) {
        try {
          const mtime = probe.statSync(path.join(stablePath, cfgFile)).mtimeMs
          if (mtime > maxMtime) {
            maxMtime = mtime
            chosenCfg = cfgFile
          }
        } catch {
          // ignore stat errors
        }
      }
    }

    try {
      const content = probe.readFileSync(path.join(stablePath, chosenCfg), 'utf-8')
      const rawBeatmapDir = parseCfgBeatmapDirectory(content)
      if (rawBeatmapDir) {
        if (isPathAbsoluteOnAnyPlatform(rawBeatmapDir)) {
          resolvedSongsPath = rawBeatmapDir
        } else {
          resolvedSongsPath = path.resolve(stablePath, rawBeatmapDir)
        }
      }
    } catch {
      resolvedSongsPath = null
    }
  }

  if (!resolvedSongsPath) {
    resolvedSongsPath = path.join(stablePath, 'Songs')
  }

  return {
    valid: true,
    songsPath: resolvedSongsPath
  }
}

export function isStablePathValid(stablePath: string, probe: FsProbe = defaultFsProbe): boolean {
  return probeStablePath(stablePath, probe).valid
}

export function getStableSongsPath(stablePath: string, probe: FsProbe = defaultFsProbe): string {
  const result = probeStablePath(stablePath, probe)
  return result.songsPath || path.join(stablePath, 'Songs')
}

export function probeLazerPath(
  lazerPath: string,
  probe: FsProbe = defaultFsProbe
): LazerProbeResult {
  if (!lazerPath || !isDir(lazerPath, probe)) {
    return { valid: false, resolvedDataPath: null, isRedirected: false }
  }

  // Priority check: storage.ini redirect takes precedence
  const storageIniPath = path.join(lazerPath, 'storage.ini')
  if (isFile(storageIniPath, probe)) {
    if (probe.readFileSync) {
      try {
        const content = probe.readFileSync(storageIniPath, 'utf-8')
        const targetFullPath = parseIniStorageFullPath(content)
        if (targetFullPath && isDir(targetFullPath, probe)) {
          const directRealm = path.join(targetFullPath, 'client.realm')
          const filesRealm = path.join(targetFullPath, 'files', 'client.realm')
          if (isFile(directRealm, probe) || isFile(filesRealm, probe)) {
            return {
              valid: true,
              resolvedDataPath: targetFullPath,
              isRedirected: true
            }
          }
        }
      } catch {
        // failed reading or probing redirect target
      }
    }
    // If storage.ini exists but points to invalid/missing realm, it's invalid (old realm at root is ignored)
    return {
      valid: false,
      resolvedDataPath: null,
      isRedirected: true
    }
  }

  // If no storage.ini, probe direct client.realm
  const directRealm = path.join(lazerPath, 'client.realm')
  const filesRealm = path.join(lazerPath, 'files', 'client.realm')
  if (isFile(directRealm, probe) || isFile(filesRealm, probe)) {
    return {
      valid: true,
      resolvedDataPath: lazerPath,
      isRedirected: false
    }
  }

  return {
    valid: false,
    resolvedDataPath: null,
    isRedirected: false
  }
}

export function isLazerPathValid(lazerPath: string, probe: FsProbe = defaultFsProbe): boolean {
  return probeLazerPath(lazerPath, probe).valid
}

function getStableCandidates(platform: OsPlatform, env: EnvProbe): string[] {
  if (platform === 'win32') {
    return [path.join(env.homeDir, 'AppData', 'Local', 'osu!')]
  }
  if (platform === 'linux') {
    return [path.join(env.homeDir, '.local', 'share', 'osu')]
  }
  return []
}

function getLazerCandidates(platform: OsPlatform, env: EnvProbe): string[] {
  if (platform === 'win32') {
    return [
      path.join(env.homeDir, 'AppData', 'Roaming', 'osu'),
      path.join(env.homeDir, 'AppData', 'Local', 'osu')
    ]
  }
  if (platform === 'linux') {
    return [path.join(env.homeDir, '.local', 'share', 'osu')]
  }
  return []
}

export function detectStablePath(
  platform: OsPlatform = process.platform,
  env: EnvProbe = getDefaultEnvProbe(),
  probe: FsProbe = defaultFsProbe
): string | null {
  for (const candidate of getStableCandidates(platform, env)) {
    if (isStablePathValid(candidate, probe)) {
      return candidate
    }
  }
  return null
}

export function detectLazerPath(
  platform: OsPlatform = process.platform,
  env: EnvProbe = getDefaultEnvProbe(),
  probe: FsProbe = defaultFsProbe
): string | null {
  for (const candidate of getLazerCandidates(platform, env)) {
    if (isLazerPathValid(candidate, probe)) {
      return candidate
    }
  }
  return null
}
