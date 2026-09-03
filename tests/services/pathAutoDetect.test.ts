import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  detectLazerPath,
  detectStablePath,
  isLazerPathValid,
  isStablePathValid,
  probeLazerPath,
  probeStablePath,
  getStableSongsPath,
  FsProbe
} from '../../src/services/pathAutoDetect'

type Kind = 'file' | 'dir'

interface ProbeOptions {
  entries: Record<string, Kind>
  fileContents?: Record<string, string>
  fileMtimes?: Record<string, number>
}

const createFsProbe = ({
  entries,
  fileContents = {},
  fileMtimes = {}
}: ProbeOptions): Required<FsProbe> => ({
  existsSync: (target: string): boolean => target in entries,
  lstatSync: (target: string): { isDirectory: () => boolean; isFile: () => boolean } => ({
    isDirectory: (): boolean => entries[target] === 'dir',
    isFile: (): boolean => entries[target] === 'file'
  }),
  readdirSync: (target: string): string[] => {
    const results: string[] = []
    for (const key of Object.keys(entries)) {
      if (path.dirname(key) === target) {
        results.push(path.basename(key))
      }
    }
    return results
  },
  readFileSync: (target: string): string => {
    if (target in fileContents) {
      return fileContents[target]
    }
    throw new Error(`File not found: ${target}`)
  },
  statSync: (target: string): { mtimeMs: number } => ({
    mtimeMs: fileMtimes[target] ?? 0
  })
})

describe('pathAutoDetect - Stable', () => {
  it('detects stable path via osu!.exe + osu!.db on Windows', () => {
    const homeDir = 'C:\\Users\\Blue'
    const stableDir = path.join(homeDir, 'AppData', 'Local', 'osu!')
    const probe = createFsProbe({
      entries: {
        [stableDir]: 'dir',
        [path.join(stableDir, 'osu!.exe')]: 'file',
        [path.join(stableDir, 'osu!.db')]: 'file'
      }
    })

    expect(detectStablePath('win32', { homeDir }, probe)).toBe(stableDir)
    expect(isStablePathValid(stableDir, probe)).toBe(true)
    const result = probeStablePath(stableDir, probe)
    expect(result.valid).toBe(true)
    expect(result.songsPath).toBe(path.join(stableDir, 'Songs'))
  })

  it('detects stable path via osu!.exe + osu!.<user>.cfg without osu!.db', () => {
    const homeDir = '/home/blue'
    const stableDir = path.join(homeDir, '.local', 'share', 'osu')
    const cfgPath = path.join(stableDir, 'osu!.blue.cfg')
    const probe = createFsProbe({
      entries: {
        [stableDir]: 'dir',
        [path.join(stableDir, 'osu!.exe')]: 'file',
        [cfgPath]: 'file'
      },
      fileContents: {
        [cfgPath]: 'BeatmapDirectory = MyCustomSongs\n'
      }
    })

    expect(detectStablePath('linux', { homeDir }, probe)).toBe(stableDir)
    const result = probeStablePath(stableDir, probe)
    expect(result.valid).toBe(true)
    expect(result.songsPath).toBe(path.resolve(stableDir, 'MyCustomSongs'))
  })

  it('resolves absolute BeatmapDirectory from cfg properly', () => {
    const stableDir = 'C:\\Games\\osu!'
    const cfgPath = path.join(stableDir, 'osu!.blue.cfg')
    const probe = createFsProbe({
      entries: {
        [stableDir]: 'dir',
        [path.join(stableDir, 'osu!.exe')]: 'file',
        [path.join(stableDir, 'osu!.db')]: 'file',
        [cfgPath]: 'file'
      },
      fileContents: {
        [cfgPath]: 'BeatmapDirectory = D:\\osu!songs\r\n'
      }
    })

    const result = probeStablePath(stableDir, probe)
    expect(result.valid).toBe(true)
    expect(result.songsPath).toBe('D:\\osu!songs')
    expect(getStableSongsPath(stableDir, probe)).toBe('D:\\osu!songs')
  })

  it('picks the most recently modified cfg when multiple cfg files exist', () => {
    const stableDir = 'C:\\Games\\osu!'
    const cfgOld = path.join(stableDir, 'osu!.olduser.cfg')
    const cfgNew = path.join(stableDir, 'osu!.newuser.cfg')
    const probe = createFsProbe({
      entries: {
        [stableDir]: 'dir',
        [path.join(stableDir, 'osu!.exe')]: 'file',
        [cfgOld]: 'file',
        [cfgNew]: 'file'
      },
      fileContents: {
        [cfgOld]: 'BeatmapDirectory = SongsOld\n',
        [cfgNew]: 'BeatmapDirectory = SongsNew\n'
      },
      fileMtimes: {
        [cfgOld]: 1000,
        [cfgNew]: 2000
      }
    })

    const result = probeStablePath(stableDir, probe)
    expect(result.valid).toBe(true)
    expect(result.songsPath).toBe(path.resolve(stableDir, 'SongsNew'))
  })

  it('rejects stable path if Songs folder exists but osu!.exe is missing', () => {
    const stableDir = '/tmp/fake-osu'
    const probe = createFsProbe({
      entries: {
        [stableDir]: 'dir',
        [path.join(stableDir, 'Songs')]: 'dir',
        [path.join(stableDir, 'osu!.db')]: 'file'
      }
    })

    expect(isStablePathValid(stableDir, probe)).toBe(false)
    expect(probeStablePath(stableDir, probe).valid).toBe(false)
  })

  it('rejects stable path if osu!.exe exists but neither osu!.db nor cfg exist', () => {
    const stableDir = '/tmp/fake-osu'
    const probe = createFsProbe({
      entries: {
        [stableDir]: 'dir',
        [path.join(stableDir, 'osu!.exe')]: 'file'
      }
    })

    expect(isStablePathValid(stableDir, probe)).toBe(false)
  })
})

describe('pathAutoDetect - Lazer', () => {
  it('detects lazer path on linux via client.realm directly', () => {
    const homeDir = '/home/blue'
    const lazerDir = path.join(homeDir, '.local', 'share', 'osu')
    const probe = createFsProbe({
      entries: {
        [lazerDir]: 'dir',
        [path.join(lazerDir, 'client.realm')]: 'file'
      }
    })

    expect(detectLazerPath('linux', { homeDir }, probe)).toBe(lazerDir)
    const result = probeLazerPath(lazerDir, probe)
    expect(result.valid).toBe(true)
    expect(result.resolvedDataPath).toBe(lazerDir)
    expect(result.isRedirected).toBe(false)
  })

  it('accepts lazer fallback files/client.realm directly', () => {
    const lazerDir = '/tmp/osu'
    const probe = createFsProbe({
      entries: {
        [lazerDir]: 'dir',
        [path.join(lazerDir, 'files', 'client.realm')]: 'file'
      }
    })

    expect(isLazerPathValid(lazerDir, probe)).toBe(true)
    const result = probeLazerPath(lazerDir, probe)
    expect(result.valid).toBe(true)
    expect(result.resolvedDataPath).toBe(lazerDir)
    expect(result.isRedirected).toBe(false)
  })

  it('follows storage.ini redirect and ignores local client.realm', () => {
    const homeDir = 'C:\\Users\\Blue'
    const rootLazerDir = path.join(homeDir, 'AppData', 'Roaming', 'osu')
    const relocatedDataDir = 'D:\\OsuData'
    const storageIni = path.join(rootLazerDir, 'storage.ini')

    const probe = createFsProbe({
      entries: {
        [rootLazerDir]: 'dir',
        [path.join(rootLazerDir, 'client.realm')]: 'file', // old file left behind
        [storageIni]: 'file',
        [relocatedDataDir]: 'dir',
        [path.join(relocatedDataDir, 'client.realm')]: 'file'
      },
      fileContents: {
        [storageIni]: `[Storage]\nFullPath = ${relocatedDataDir}\n`
      }
    })

    const probeResult = probeLazerPath(rootLazerDir, probe)
    expect(probeResult.valid).toBe(true)
    expect(probeResult.resolvedDataPath).toBe(relocatedDataDir)
    expect(probeResult.isRedirected).toBe(true)
    expect(isLazerPathValid(rootLazerDir, probe)).toBe(true)
  })

  it('rejects lazer path if storage.ini points to missing or non-existent client.realm', () => {
    const rootLazerDir = 'C:\\Users\\Blue\\AppData\\Roaming\\osu'
    const missingTarget = 'E:\\EmptyFolder'
    const storageIni = path.join(rootLazerDir, 'storage.ini')

    const probe = createFsProbe({
      entries: {
        [rootLazerDir]: 'dir',
        [path.join(rootLazerDir, 'client.realm')]: 'file', // old file should NOT be accepted
        [storageIni]: 'file',
        [missingTarget]: 'dir'
      },
      fileContents: {
        [storageIni]: `[Storage]\nFullPath = ${missingTarget}\n`
      }
    })

    const probeResult = probeLazerPath(rootLazerDir, probe)
    expect(probeResult.valid).toBe(false)
    expect(probeResult.resolvedDataPath).toBeNull()
    expect(probeResult.isRedirected).toBe(true)
    expect(isLazerPathValid(rootLazerDir, probe)).toBe(false)
  })

  it('returns null when no candidate paths are valid', () => {
    const probe = createFsProbe({ entries: {} })
    expect(detectStablePath('linux', { homeDir: '/home/blue' }, probe)).toBeNull()
    expect(detectLazerPath('win32', { homeDir: 'C:\\Users\\Blue' }, probe)).toBeNull()
  })
})
