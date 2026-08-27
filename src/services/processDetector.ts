import { exec } from 'child_process'
import { promisify } from 'util'
import { getOsuStablePath, getOsuLazerPath } from './settingsStore'

const execAsync = promisify(exec)

export interface ProcessCheckResult {
  running: boolean
  client?: 'stable' | 'lazer'
  processName?: string
}

const STABLE_PROCESS_NAMES = ['osu!.exe', 'osu!']
const LAZER_PROCESS_NAMES = ['osu!lazer.exe', 'osu.exe', 'osu!lazer']

/**
 * Checks if any osu! process (stable, lazer, or either) is currently running.
 */
export async function isOsuProcessRunning(
  target: 'stable' | 'lazer' | 'any' = 'any'
): Promise<ProcessCheckResult> {
  const platform = process.platform

  try {
    if (platform === 'win32') {
      return await checkWindowsProcesses(target)
    } else {
      return await checkUnixProcesses(target)
    }
  } catch (error) {
    console.warn('Failed to detect running osu! process:', error)
    // If detection fails due to environment permissions, return not running
    return { running: false }
  }
}

async function checkWindowsProcesses(
  target: 'stable' | 'lazer' | 'any'
): Promise<ProcessCheckResult> {
  // Use tasklist for fast, lightweight process discovery on Windows
  const { stdout } = await execAsync('tasklist /FO CSV /NH', { encoding: 'utf-8', timeout: 3000 })
  const lines = stdout.split('\n')

  const runningProcesses: string[] = []
  for (const line of lines) {
    const match = line.match(/^"([^"]+)"/)
    if (match) {
      runningProcesses.push(match[1].toLowerCase())
    }
  }

  const isStable = runningProcesses.some((name) =>
    STABLE_PROCESS_NAMES.some((p) => p.toLowerCase() === name)
  )
  const isLazer = runningProcesses.some((name) =>
    LAZER_PROCESS_NAMES.some((p) => p.toLowerCase() === name)
  )

  // Note: On Windows, osu!lazer might also run as osu!.exe depending on installation method.
  // We can disambiguate if paths are configured, or handle 'osu!.exe' appropriately.
  if (target === 'stable') {
    if (isStable) {
      return { running: true, client: 'stable', processName: 'osu!.exe' }
    }
    return { running: false }
  }

  if (target === 'lazer') {
    if (isLazer) {
      return { running: true, client: 'lazer', processName: 'osu!lazer.exe' }
    }
    // If lazer is installed as osu!.exe and stable is not configured or lazer path exists
    const stablePath = getOsuStablePath()
    const lazerPath = getOsuLazerPath()
    if (isStable && !stablePath && lazerPath) {
      return { running: true, client: 'lazer', processName: 'osu!.exe' }
    }
    return { running: false }
  }

  if (isStable || isLazer) {
    return {
      running: true,
      client: isLazer ? 'lazer' : 'stable',
      processName: isLazer ? 'osu!lazer.exe' : 'osu!.exe'
    }
  }

  return { running: false }
}

async function checkUnixProcesses(target: 'stable' | 'lazer' | 'any'): Promise<ProcessCheckResult> {
  try {
    const { stdout } = await execAsync('pgrep -l -i osu', { encoding: 'utf-8', timeout: 3000 })
    const output = stdout.trim()
    if (!output) {
      return { running: false }
    }

    const lines = output.split('\n')
    for (const line of lines) {
      const lower = line.toLowerCase()
      if (target === 'lazer' || target === 'any') {
        if (lower.includes('lazer')) {
          return { running: true, client: 'lazer', processName: line }
        }
      }
      if (target === 'stable' || target === 'any') {
        if (!lower.includes('lazer')) {
          return { running: true, client: 'stable', processName: line }
        }
      }
    }

    return { running: true, processName: output }
  } catch {
    // pgrep exits with 1 when no process is found
    return { running: false }
  }
}
