import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getOsuStablePath, getOsuLazerPath } from './settingsStore'
import { detectStablePath, detectLazerPath } from './pathAutoDetect'

const execAsync = promisify(exec)

export interface ProcessCheckResult {
  running: boolean
  client?: 'stable' | 'lazer'
  processName?: string
  executablePath?: string
  pid?: number
}

export interface RunningProcessInfo {
  pid?: number
  name: string
  executablePath?: string
}

/**
 * Checks whether childPath is equal to or resides inside parentPath.
 * Avoids simple string prefix bugs (e.g., C:\osu vs C:\osulazer).
 */
export function isPathInside(childPath: string, parentPath: string): boolean {
  if (!childPath || !parentPath) return false
  const normChild = path.resolve(childPath).toLowerCase()
  const normParent = path.resolve(parentPath).toLowerCase()
  if (normChild === normParent) return true
  const rel = path.relative(normParent, normChild)
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * Classifies a running process as 'stable', 'lazer', or undefined based on its
 * executable path, process name, configured paths, and installation conventions.
 */
export function classifyProcess(
  proc: RunningProcessInfo,
  options?: {
    stablePath?: string
    lazerPath?: string
    detectedStablePath?: string | null
    detectedLazerPath?: string | null
  }
): 'stable' | 'lazer' | undefined {
  const stablePath = options?.stablePath ?? getOsuStablePath()
  const lazerPath = options?.lazerPath ?? getOsuLazerPath()
  const detectedStable = options?.detectedStablePath ?? detectStablePath()
  const detectedLazer = options?.detectedLazerPath ?? detectLazerPath()

  const execPath = proc.executablePath ? path.normalize(proc.executablePath).toLowerCase() : ''
  const name = proc.name.toLowerCase()

  // 1. Explicit name checks for distinct lazer binary names
  if (name === 'osu!lazer.exe' || name === 'osu!lazer' || name === 'osulazer.exe') {
    return 'lazer'
  }

  // 2. Path matching against user-configured paths
  if (execPath) {
    if (stablePath && isPathInside(execPath, stablePath)) {
      return 'stable'
    }
    if (lazerPath && isPathInside(execPath, lazerPath)) {
      return 'lazer'
    }

    // 3. Known lazer install paths / path keywords (Velopack, AppImage, Flatpak, etc.)
    if (
      execPath.includes('osulazer') ||
      execPath.includes('osu-lazer') ||
      execPath.includes('osu!lazer') ||
      execPath.includes('osu.appimage') ||
      execPath.includes('osu-framework')
    ) {
      return 'lazer'
    }

    // 4. Path matching against auto-detected default paths
    if (detectedStable && isPathInside(execPath, detectedStable)) {
      return 'stable'
    }
    if (detectedLazer && isPathInside(execPath, detectedLazer)) {
      return 'lazer'
    }
  }

  // 5. Fallback heuristics when executable path is missing or inconclusive
  if (name.includes('lazer')) {
    return 'lazer'
  }

  if (name === 'osu!.exe' || name === 'osu!' || name === 'osu.exe') {
    // If lazerPath is set but stablePath is not, and path does not look like stable
    if (lazerPath && !stablePath && !execPath.includes('osu!')) {
      return 'lazer'
    }
    return 'stable'
  }

  return undefined
}

/**
 * Retrieves running osu processes on Windows with full ExecutablePath.
 */
export async function getWindowsProcesses(): Promise<RunningProcessInfo[]> {
  // 1. Primary: PowerShell Get-CimInstance (fast and reliable on Windows 10/11)
  try {
    const psCmd =
      'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process -Filter \\"Name like \'%osu%\'\\" | Select-Object ProcessId, Name, ExecutablePath | ConvertTo-Json -Compress"'
    const { stdout } = await execAsync(psCmd, { encoding: 'utf-8', timeout: 5000 })
    const trimmed = stdout.trim()
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed)
        const list = Array.isArray(parsed) ? parsed : [parsed]
        return list
          .filter((item) => item && (item.Name || item.ExecutablePath))
          .map((item) => ({
            pid: typeof item.ProcessId === 'number' ? item.ProcessId : undefined,
            name:
              item.Name || (item.ExecutablePath ? path.basename(item.ExecutablePath) : 'osu!.exe'),
            executablePath: item.ExecutablePath || ''
          }))
      } catch {
        // Fall through to WMIC / tasklist
      }
    } else {
      return []
    }
  } catch {
    // Fall through to WMIC / tasklist
  }

  // 2. Fallback: WMIC (for legacy Windows environments)
  try {
    const { stdout } = await execAsync(
      'wmic process where "name like \'%osu%\'" get ExecutablePath,Name,ProcessId /format:csv',
      { encoding: 'utf-8', timeout: 3000 }
    )
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const results: RunningProcessInfo[] = []
    for (const line of lines) {
      if (line.toLowerCase().startsWith('node') || !line.includes(',')) continue
      const parts = line.split(',')
      if (parts.length >= 4) {
        const execPath = parts[1]?.trim() || ''
        const name = parts[2]?.trim() || ''
        const pid = parseInt(parts[3]?.trim(), 10)
        if (name || execPath) {
          results.push({
            pid: isNaN(pid) ? undefined : pid,
            name: name || (execPath ? path.basename(execPath) : 'osu!.exe'),
            executablePath: execPath
          })
        }
      }
    }
    if (results.length > 0) return results
  } catch {
    // WMIC unavailable
  }

  // 3. Fallback: tasklist (basic process names without executable paths)
  try {
    const { stdout } = await execAsync('tasklist /FO CSV /NH', { encoding: 'utf-8', timeout: 3000 })
    const lines = stdout.split('\n')
    const results: RunningProcessInfo[] = []
    for (const line of lines) {
      const match = line.match(/^"([^"]+)"\s*,\s*"([^"]+)"/)
      if (match) {
        const name = match[1]
        const pid = parseInt(match[2], 10)
        if (name.toLowerCase().includes('osu')) {
          results.push({
            pid: isNaN(pid) ? undefined : pid,
            name,
            executablePath: ''
          })
        }
      }
    }
    return results
  } catch {
    return []
  }
}

/**
 * Retrieves running osu processes on Linux by reading /proc/<pid>/exe and /proc/<pid>/cmdline.
 */
export async function getLinuxProcesses(): Promise<RunningProcessInfo[]> {
  const results: RunningProcessInfo[] = []

  // 1. Direct /proc inspection
  try {
    if (fs.existsSync('/proc')) {
      const entries = await fs.promises.readdir('/proc')
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue
        const pid = parseInt(entry, 10)
        try {
          let execPath = ''
          try {
            execPath = await fs.promises.readlink(`/proc/${pid}/exe`)
          } catch {
            // Defunct or insufficient permissions
          }

          let comm = ''
          try {
            comm = (await fs.promises.readFile(`/proc/${pid}/comm`, 'utf-8')).trim()
          } catch {
            // Ignore
          }

          let cmdline = ''
          try {
            cmdline = (await fs.promises.readFile(`/proc/${pid}/cmdline`, 'utf-8'))
              .replace(/\0/g, ' ')
              .trim()
          } catch {
            // Ignore
          }

          const combined = `${comm} ${execPath} ${cmdline}`.toLowerCase()
          if (combined.includes('osu')) {
            let effectiveExecPath = execPath
            if (
              cmdline.toLowerCase().includes('osu!.exe') ||
              cmdline.toLowerCase().includes('osu!')
            ) {
              const match = cmdline.match(/([A-Za-z]:\\[^"]+osu!\.exe|\S+osu!\.exe|\S+osu)/i)
              if (match) {
                effectiveExecPath = match[1]
              }
            }

            results.push({
              pid,
              name: comm || (effectiveExecPath ? path.basename(effectiveExecPath) : 'osu'),
              executablePath: effectiveExecPath || execPath
            })
          }
        } catch {
          // Process might have terminated during iteration
        }
      }
      if (results.length > 0) return results
    }
  } catch {
    // /proc access error
  }

  // 2. Fallback: pgrep
  try {
    const { stdout } = await execAsync('pgrep -l -i osu', { encoding: 'utf-8', timeout: 3000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pid = parseInt(parts[0], 10)
      const name = parts.slice(1).join(' ') || 'osu'
      let executablePath = ''
      try {
        if (!isNaN(pid) && fs.existsSync(`/proc/${pid}/exe`)) {
          executablePath = fs.readlinkSync(`/proc/${pid}/exe`)
        }
      } catch {
        // Ignore
      }
      results.push({
        pid: isNaN(pid) ? undefined : pid,
        name,
        executablePath
      })
    }
  } catch {
    // pgrep exits with 1 if no process found
  }

  return results
}

/**
 * Retrieves running osu processes on macOS / generic Unix.
 */
export async function getUnixProcesses(): Promise<RunningProcessInfo[]> {
  try {
    const { stdout } = await execAsync('pgrep -l -i osu', { encoding: 'utf-8', timeout: 3000 })
    const lines = stdout.trim().split('\n').filter(Boolean)
    return lines.map((line) => {
      const parts = line.trim().split(/\s+/)
      const pid = parseInt(parts[0], 10)
      const name = parts.slice(1).join(' ') || 'osu'
      return {
        pid: isNaN(pid) ? undefined : pid,
        name,
        executablePath: ''
      }
    })
  } catch {
    return []
  }
}

export async function getRunningProcesses(): Promise<RunningProcessInfo[]> {
  const platform = process.platform
  if (platform === 'win32') {
    return await getWindowsProcesses()
  } else if (platform === 'linux') {
    return await getLinuxProcesses()
  } else {
    return await getUnixProcesses()
  }
}

/**
 * Checks if any osu! process (stable, lazer, or either) is currently running.
 */
export async function isOsuProcessRunning(
  target: 'stable' | 'lazer' | 'any' = 'any'
): Promise<ProcessCheckResult> {
  try {
    const processes = await getRunningProcesses()
    if (processes.length === 0) {
      return { running: false }
    }

    const classified = processes.map((p) => ({
      ...p,
      client: classifyProcess(p)
    }))

    if (target === 'stable') {
      const match = classified.find((p) => p.client === 'stable')
      if (match) {
        return {
          running: true,
          client: 'stable',
          processName: match.name,
          executablePath: match.executablePath,
          pid: match.pid
        }
      }
      return { running: false }
    }

    if (target === 'lazer') {
      const match = classified.find((p) => p.client === 'lazer')
      if (match) {
        return {
          running: true,
          client: 'lazer',
          processName: match.name,
          executablePath: match.executablePath,
          pid: match.pid
        }
      }
      return { running: false }
    }

    // target === 'any'
    const match = classified.find((p) => p.client) || classified[0]
    return {
      running: true,
      client: match?.client,
      processName: match?.name,
      executablePath: match?.executablePath,
      pid: match?.pid
    }
  } catch (error) {
    console.warn('Failed to detect running osu! process:', error)
    return { running: false }
  }
}
