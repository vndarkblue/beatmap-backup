import fs from 'fs'
import path from 'path'
import os from 'os'

export type OsPlatform = 'win32' | 'linux' | 'darwin' | string

type FsProbe = {
  existsSync: (target: string) => boolean
  lstatSync: (target: string) => { isDirectory(): boolean; isFile(): boolean }
}

type EnvProbe = {
  homeDir: string
}

const defaultFsProbe: FsProbe = {
  existsSync: fs.existsSync,
  lstatSync: fs.lstatSync
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

export function isStablePathValid(stablePath: string, probe: FsProbe = defaultFsProbe): boolean {
  if (!stablePath) return false
  return isDir(path.join(stablePath, 'Songs'), probe)
}

export function isLazerPathValid(lazerPath: string, probe: FsProbe = defaultFsProbe): boolean {
  if (!lazerPath) return false
  return (
    isFile(path.join(lazerPath, 'client.realm'), probe) ||
    isFile(path.join(lazerPath, 'files', 'client.realm'), probe)
  )
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
    return [path.join(env.homeDir, 'AppData', 'Local', 'osu')]
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
