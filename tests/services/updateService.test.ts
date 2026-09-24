import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.2.1'),
    getPath: vi.fn(() => 'C:\\Users\\Mock\\Downloads'),
    isPackaged: true
  },
  shell: {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn()
  }
}))

vi.mock('electron-updater', () => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      forceDevUpdateConfig: false,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = []
        listeners[event].push(handler)
      }),
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn()
    }
  }
})

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  const mockChmodSync = vi.fn()
  const mockExistsSync = vi.fn(() => true)
  const mockUnlinkSync = vi.fn()
  return {
    ...actual,
    default: {
      ...actual,
      chmodSync: mockChmodSync,
      existsSync: mockExistsSync,
      unlinkSync: mockUnlinkSync
    },
    chmodSync: mockChmodSync,
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync
  }
})

describe('UpdateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('correctly reads app version', async () => {
    const { default: updateService } = await import('../../src/services/updateService')
    expect(updateService.getAppVersion()).toBe('1.2.1')
  })

  it('detects distribution type on Windows without uninstaller as win-portable', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    const { default: updateService } = await import('../../src/services/updateService')
    const dist = updateService.getDistributionType()
    expect(['win-portable', 'win-installer']).toContain(dist)

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('opens release page on GitHub when openReleasePage is called', async () => {
    const { shell } = await import('electron')
    const { default: updateService } = await import('../../src/services/updateService')

    await updateService.openReleasePage('1.2.2')
    expect(shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/vndarkblue/beatmap-backup/releases/tag/v1.2.2'
    )

    await updateService.openReleasePage()
    expect(shell.openExternal).toHaveBeenCalledWith(
      'https://github.com/vndarkblue/beatmap-backup/releases/latest'
    )
  })

  it('emits events to registered listeners', async () => {
    const { default: updateService } = await import('../../src/services/updateService')
    const listener = vi.fn()
    const unsubscribe = updateService.addListener(listener)

    // Verify unsubscribing works cleanly
    unsubscribe()
    expect(typeof unsubscribe).toBe('function')
  })

  it('correctly compares semantic versions', async () => {
    const { isNewerVersion } = await import('../../src/services/updateService')
    expect(isNewerVersion('1.2.2', '1.2.1')).toBe(true)
    expect(isNewerVersion('v1.3.0', '1.2.5')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('1.2.1', '1.2.1')).toBe(false)
    expect(isNewerVersion('1.2.0', '1.2.1')).toBe(false)
    expect(isNewerVersion('1.2.1', '1.2.2-dev')).toBe(false)
  })

  it('formats release notes from string or array', async () => {
    const { formatReleaseNotes } = await import('../../src/services/updateService')
    expect(formatReleaseNotes('Plain note')).toBe('Plain note')
    expect(formatReleaseNotes(['Note 1', 'Note 2'])).toBe('Note 1\n\nNote 2')
    expect(
      formatReleaseNotes([
        { version: '1.2.1', note: 'Fix A' },
        { version: '1.2.0', note: 'Feature B' }
      ])
    ).toBe('Fix A\n\nFeature B')
    expect(formatReleaseNotes(null)).toBeUndefined()
    expect(formatReleaseNotes(undefined)).toBeUndefined()
  })
})

describe('parseSha512FromYaml', () => {
  it('parses sha512 from single file yaml', async () => {
    const { parseSha512FromYaml } = await import('../../src/services/updateService')
    const yaml = `
version: 1.2.1
path: beatmap-backup-1.2.1.AppImage
sha512: O3+babc123==
releaseDate: '2026-09-13T12:00:00.000Z'
`
    expect(parseSha512FromYaml(yaml, 'beatmap-backup-1.2.1.AppImage')).toBe('O3+babc123==')
    expect(parseSha512FromYaml(yaml)).toBe('O3+babc123==')
  })

  it('parses target file sha512 from multi-file yaml with files array', async () => {
    const { parseSha512FromYaml } = await import('../../src/services/updateService')
    const yaml = `
version: 1.2.1
files:
  - url: beatmap-backup-1.2.1.AppImage
    sha512: AppImageHash123==
    size: 123456
  - url: beatmap-backup_1.2.1_amd64.deb
    sha512: DebHash456==
    size: 654321
path: beatmap-backup-1.2.1.AppImage
sha512: AppImageHash123==
`
    expect(parseSha512FromYaml(yaml, 'beatmap-backup-1.2.1.AppImage')).toBe('AppImageHash123==')
    expect(parseSha512FromYaml(yaml, 'beatmap-backup_1.2.1_amd64.deb')).toBe('DebHash456==')
    expect(parseSha512FromYaml(yaml, 'non-existent.tar.gz')).toBeNull()
  })

  it('returns null for empty or invalid yaml', async () => {
    const { parseSha512FromYaml } = await import('../../src/services/updateService')
    expect(parseSha512FromYaml('')).toBeNull()
    expect(parseSha512FromYaml('foo: bar')).toBeNull()
  })
})

describe('verifyChecksum', () => {
  it('verifies successfully with base64 hash', async () => {
    const crypto = await import('crypto')
    const { verifyChecksum } = await import('../../src/services/updateService')
    const sampleData = Buffer.from('test content for sha512 verification')
    const sha512Digest = crypto.createHash('sha512').update(sampleData).digest()
    const base64Hash = sha512Digest.toString('base64')

    expect(verifyChecksum(sha512Digest, base64Hash)).toBe(true)
    expect(verifyChecksum(sha512Digest, `  ${base64Hash}  `)).toBe(true)
  })

  it('verifies successfully with hex hash (case insensitive)', async () => {
    const crypto = await import('crypto')
    const { verifyChecksum } = await import('../../src/services/updateService')
    const sampleData = Buffer.from('test content for sha512 verification')
    const sha512Digest = crypto.createHash('sha512').update(sampleData).digest()
    const hexHash = sha512Digest.toString('hex')

    expect(verifyChecksum(sha512Digest, hexHash)).toBe(true)
    expect(verifyChecksum(sha512Digest, hexHash.toUpperCase())).toBe(true)
  })

  it('rejects mismatched hash', async () => {
    const crypto = await import('crypto')
    const { verifyChecksum } = await import('../../src/services/updateService')
    const sampleData = Buffer.from('test content for sha512 verification')
    const sha512Digest = crypto.createHash('sha512').update(sampleData).digest()

    expect(verifyChecksum(sha512Digest, 'wrong-hash')).toBe(false)
  })

  it('returns false for empty parameters', async () => {
    const { verifyChecksum } = await import('../../src/services/updateService')
    expect(verifyChecksum(Buffer.alloc(0), '')).toBe(false)
  })
})

type UpdateServiceTestAccess = {
  fetchLinuxUpdateYml: (version: string) => Promise<string | null>
  downloadFile: (
    url: string,
    destPath: string,
    onProgress: (transferred: number, total: number) => void
  ) => Promise<Buffer>
  getExpectedSha512ForFile: (fileName: string) => string | null
}

describe('downloadLinuxAppImage verification', () => {
  it('successfully downloads and verifies AppImage when checksum matches', async () => {
    const crypto = await import('crypto')
    const fs = await import('fs')
    const { default: updateService } = await import('../../src/services/updateService')
    const service = updateService as unknown as UpdateServiceTestAccess
    const sampleBuffer = Buffer.from('mock app image content')
    const digest = crypto.createHash('sha512').update(sampleBuffer).digest()
    const expectedSha512 = digest.toString('base64')

    const mockYaml = `
version: 1.3.0
files:
  - url: beatmap-backup-1.3.0.AppImage
    sha512: ${expectedSha512}
`
    vi.spyOn(service, 'fetchLinuxUpdateYml').mockResolvedValue(mockYaml)
    vi.spyOn(service, 'downloadFile').mockResolvedValue(digest)

    const res = await updateService.downloadLinuxAppImage('1.3.0')
    expect(res.success).toBe(true)
    expect(fs.chmodSync).toHaveBeenCalled()
  })

  it('rejects and removes file when checksum mismatches', async () => {
    const crypto = await import('crypto')
    const fs = await import('fs')
    const { default: updateService } = await import('../../src/services/updateService')
    const service = updateService as unknown as UpdateServiceTestAccess
    const sampleBuffer = Buffer.from('corrupted app image content')
    const digest = crypto.createHash('sha512').update(sampleBuffer).digest()
    const wrongSha512 = 'totally-wrong-base64-hash=='

    const mockYaml = `
version: 1.3.0
files:
  - url: beatmap-backup-1.3.0.AppImage
    sha512: ${wrongSha512}
`
    vi.spyOn(service, 'fetchLinuxUpdateYml').mockResolvedValue(mockYaml)
    vi.spyOn(service, 'downloadFile').mockResolvedValue(digest)

    const res = await updateService.downloadLinuxAppImage('1.3.0')
    expect(res.success).toBe(false)
    expect(res.message).toContain('SHA-512 checksum mismatch')
    expect(fs.unlinkSync).toHaveBeenCalled()
  })

  it('fails cleanly if checksum manifest cannot be found', async () => {
    const { default: updateService } = await import('../../src/services/updateService')
    const service = updateService as unknown as UpdateServiceTestAccess
    vi.spyOn(service, 'getExpectedSha512ForFile').mockReturnValue(null)
    vi.spyOn(service, 'fetchLinuxUpdateYml').mockResolvedValue(null)

    const res = await updateService.downloadLinuxAppImage('1.3.0')
    expect(res.success).toBe(false)
    expect(res.message).toContain('checksum not found')
  })
})
