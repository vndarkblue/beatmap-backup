import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import {
  isPathInside,
  classifyProcess,
  isOsuProcessRunning,
  getUnixProcesses
} from '../../src/services/processDetector'

const mockExec = vi.fn()

vi.mock('child_process', () => ({
  exec: (
    cmd: string,
    options: unknown,
    callback: (err: unknown, result?: { stdout: string; stderr?: string }) => void
  ) => {
    mockExec(cmd, options, callback)
  }
}))

vi.mock('../../src/services/settingsStore', () => ({
  getOsuStablePath: () => 'C:/osu-stable',
  getOsuLazerPath: () => 'C:/osu-lazer'
}))

vi.mock('../../src/services/pathAutoDetect', () => ({
  detectStablePath: () => 'C:/Users/test/AppData/Local/osu!',
  detectLazerPath: () => 'C:/Users/test/AppData/Local/osu'
}))

describe('processDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isPathInside', () => {
    it('returns true when child is direct child or nested inside parent', () => {
      expect(isPathInside('C:/osu/osu!.exe', 'C:/osu')).toBe(true)
      expect(isPathInside('C:\\osu\\Songs\\test.osz', 'C:/osu')).toBe(true)
      expect(isPathInside('C:/osu', 'C:/osu')).toBe(true)
    })

    it('returns false for sibling paths sharing common prefixes', () => {
      expect(isPathInside('C:/osulazer/osu!.exe', 'C:/osu')).toBe(false)
      expect(isPathInside('C:/osu-backup/osu!.exe', 'C:/osu')).toBe(false)
    })

    it('handles empty or missing paths gracefully', () => {
      expect(isPathInside('', 'C:/osu')).toBe(false)
      expect(isPathInside('C:/osu', '')).toBe(false)
    })

    it('normalizes .. traversal segments correctly on Windows and POSIX', () => {
      // Parent path with '..'
      expect(isPathInside('C:/osu/osu!.exe', 'C:/something/../osu')).toBe(true)
      expect(isPathInside('C:\\osu\\osu!.exe', 'C:\\Program Files\\..\\osu')).toBe(true)

      // Child path with '..' inside parent
      expect(isPathInside('C:/osu/Songs/../osu!.exe', 'C:/osu')).toBe(true)

      // Child path that escapes parent via '..'
      expect(isPathInside('C:/osu/../other/app.exe', 'C:/osu')).toBe(false)

      // POSIX flavor with '..'
      expect(
        isPathInside('/home/user/games/osu/osu.AppImage', '/home/user/games/../games/osu')
      ).toBe(true)
      expect(
        isPathInside('/home/user/games/osu/../../other/app', '/home/user/games/osu')
      ).toBe(false)
    })
  })

  describe('classifyProcess', () => {
    it('classifies osu!.exe in stable folder as stable', () => {
      const result = classifyProcess({
        name: 'osu!.exe',
        executablePath: 'C:/osu-stable/osu!.exe'
      })
      expect(result).toBe('stable')
    })

    it('classifies osu!.exe in lazer folder as lazer', () => {
      const result = classifyProcess({
        name: 'osu!.exe',
        executablePath: 'C:/osu-lazer/osu!.exe'
      })
      expect(result).toBe('lazer')
    })

    it('classifies osu!.exe in %LOCALAPPDATA%/osulazer (Velopack installer) as lazer even with osu!.exe process name', () => {
      const result = classifyProcess({
        name: 'osu!.exe',
        executablePath: 'C:\\Users\\test\\AppData\\Local\\osulazer\\app-2024.820.0\\osu!.exe'
      })
      expect(result).toBe('lazer')
    })

    it('classifies explicit osu!lazer.exe or osulazer.exe as lazer', () => {
      expect(classifyProcess({ name: 'osu!lazer.exe' })).toBe('lazer')
      expect(classifyProcess({ name: 'osulazer.exe' })).toBe('lazer')
      expect(classifyProcess({ name: 'osu!lazer' })).toBe('lazer')
    })

    it('classifies Linux AppImage or flatpak as lazer', () => {
      const result = classifyProcess({
        name: 'osu',
        executablePath: '/home/user/Applications/osu.AppImage'
      })
      expect(result).toBe('lazer')
    })

    it('classifies auto-detected stable path as stable when settings are empty', () => {
      const result = classifyProcess(
        {
          name: 'osu!.exe',
          executablePath: 'C:/Users/test/AppData/Local/osu!/osu!.exe'
        },
        { stablePath: '', lazerPath: '' }
      )
      expect(result).toBe('stable')
    })
  })

  describe('isOsuProcessRunning on Windows', () => {
    const originalPlatform = process.platform

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
    })

    afterAll(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    it('detects running osu!stable from PowerShell JSON output', async () => {
      mockExec.mockImplementation((cmd, _opts, cb) => {
        if (typeof cmd === 'string' && cmd.includes('Get-CimInstance')) {
          cb(null, {
            stdout: JSON.stringify({
              ProcessId: 1234,
              Name: 'osu!.exe',
              ExecutablePath: 'C:\\osu-stable\\osu!.exe'
            })
          })
        } else {
          cb(new Error('Unknown command'))
        }
      })

      const stableResult = await isOsuProcessRunning('stable')
      expect(stableResult.running).toBe(true)
      expect(stableResult.client).toBe('stable')
      expect(stableResult.executablePath).toBe('C:\\osu-stable\\osu!.exe')
      expect(stableResult.pid).toBe(1234)

      const lazerResult = await isOsuProcessRunning('lazer')
      expect(lazerResult.running).toBe(false)
    })

    it('detects running osu!lazer under osu!.exe name correctly and does not confuse with stable', async () => {
      mockExec.mockImplementation((cmd, _opts, cb) => {
        if (typeof cmd === 'string' && cmd.includes('Get-CimInstance')) {
          cb(null, {
            stdout: JSON.stringify({
              ProcessId: 5678,
              Name: 'osu!.exe',
              ExecutablePath: 'C:\\Users\\test\\AppData\\Local\\osulazer\\osu!.exe'
            })
          })
        }
      })

      const lazerResult = await isOsuProcessRunning('lazer')
      expect(lazerResult.running).toBe(true)
      expect(lazerResult.client).toBe('lazer')
      expect(lazerResult.executablePath).toBe('C:\\Users\\test\\AppData\\Local\\osulazer\\osu!.exe')

      const stableResult = await isOsuProcessRunning('stable')
      expect(stableResult.running).toBe(false)
    })

    it('handles both stable and lazer running concurrently', async () => {
      mockExec.mockImplementation((cmd, _opts, cb) => {
        if (typeof cmd === 'string' && cmd.includes('Get-CimInstance')) {
          cb(null, {
            stdout: JSON.stringify([
              {
                ProcessId: 1001,
                Name: 'osu!.exe',
                ExecutablePath: 'C:\\osu-stable\\osu!.exe'
              },
              {
                ProcessId: 1002,
                Name: 'osu!.exe',
                ExecutablePath: 'C:\\Users\\test\\AppData\\Local\\osulazer\\osu!.exe'
              }
            ])
          })
        }
      })

      const stableResult = await isOsuProcessRunning('stable')
      expect(stableResult.running).toBe(true)
      expect(stableResult.client).toBe('stable')

      const lazerResult = await isOsuProcessRunning('lazer')
      expect(lazerResult.running).toBe(true)
      expect(lazerResult.client).toBe('lazer')

      const anyResult = await isOsuProcessRunning('any')
      expect(anyResult.running).toBe(true)
    })

    it('returns running false when no osu processes are found', async () => {
      mockExec.mockImplementation((cmd, _opts, cb) => {
        if (typeof cmd === 'string' && cmd.includes('Get-CimInstance')) {
          cb(null, { stdout: '' })
        }
      })

      const result = await isOsuProcessRunning('any')
      expect(result.running).toBe(false)
    })

    it('falls back to WMIC when PowerShell fails', async () => {
      mockExec.mockImplementation((cmd, _opts, cb) => {
        if (typeof cmd === 'string' && cmd.includes('Get-CimInstance')) {
          cb(new Error('PowerShell unavailable'))
        } else if (typeof cmd === 'string' && cmd.includes('wmic')) {
          cb(null, {
            stdout:
              'Node,ExecutablePath,Name,ProcessId\r\nHOST,C:\\osu-stable\\osu!.exe,osu!.exe,9999\r\n'
          })
        }
      })

      const result = await isOsuProcessRunning('stable')
      expect(result.running).toBe(true)
      expect(result.client).toBe('stable')
      expect(result.pid).toBe(9999)
    })

    it('gracefully returns running: false when all process inspection methods fail', async () => {
      mockExec.mockImplementation((_cmd, _opts, cb) => {
        cb(new Error('Access denied'))
      })

      const result = await isOsuProcessRunning('any')
      expect(result.running).toBe(false)
    })
  })

  describe('Unix / macOS fallback', () => {
    it('parses pgrep output on generic Unix', async () => {
      mockExec.mockImplementation((cmd, _opts, cb) => {
        if (typeof cmd === 'string' && cmd.includes('pgrep')) {
          cb(null, { stdout: '4321 osu!lazer\n' })
        }
      })

      const procs = await getUnixProcesses()
      expect(procs).toHaveLength(1)
      expect(procs[0].pid).toBe(4321)
      expect(procs[0].name).toBe('osu!lazer')
    })
  })
})
