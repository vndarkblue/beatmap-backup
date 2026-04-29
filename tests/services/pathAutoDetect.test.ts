import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  detectLazerPath,
  detectStablePath,
  isLazerPathValid,
  isStablePathValid
} from '../../src/services/pathAutoDetect'

type Kind = 'file' | 'dir'

const createFsProbe = (
  entries: Record<string, Kind>
): {
  existsSync: (target: string) => boolean
  lstatSync: (target: string) => { isDirectory: () => boolean; isFile: () => boolean }
} => ({
  existsSync: (target: string): boolean => target in entries,
  lstatSync: (target: string): { isDirectory: () => boolean; isFile: () => boolean } => ({
    isDirectory: (): boolean => entries[target] === 'dir',
    isFile: (): boolean => entries[target] === 'file'
  })
})

describe('pathAutoDetect', () => {
  it('detects stable path on windows via Songs folder', () => {
    const homeDir = 'C:\\Users\\Blue'
    const stableDir = path.join(homeDir, 'AppData', 'Local', 'osu!')
    const probe = createFsProbe({
      [path.join(stableDir, 'Songs')]: 'dir'
    })

    expect(detectStablePath('win32', { homeDir }, probe)).toBe(stableDir)
  })

  it('detects lazer path on linux via client.realm file', () => {
    const homeDir = '/home/blue'
    const lazerDir = path.join(homeDir, '.local', 'share', 'osu')
    const probe = createFsProbe({
      [path.join(lazerDir, 'client.realm')]: 'file'
    })

    expect(detectLazerPath('linux', { homeDir }, probe)).toBe(lazerDir)
  })

  it('accepts lazer fallback files/client.realm', () => {
    const lazerDir = '/tmp/osu'
    const probe = createFsProbe({
      [path.join(lazerDir, 'files', 'client.realm')]: 'file'
    })

    expect(isLazerPathValid(lazerDir, probe)).toBe(true)
  })

  it('returns null when no candidate paths are valid', () => {
    const probe = createFsProbe({})
    expect(detectStablePath('linux', { homeDir: '/home/blue' }, probe)).toBeNull()
    expect(detectLazerPath('win32', { homeDir: 'C:\\Users\\Blue' }, probe)).toBeNull()
  })

  it('rejects paths missing required stable marker', () => {
    const stableDir = '/tmp/osu-stable'
    const probe = createFsProbe({
      [path.join(stableDir, 'Songs')]: 'file'
    })
    expect(isStablePathValid(stableDir, probe)).toBe(false)
  })
})
