import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import https from 'https'
import crypto from 'crypto'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import type {
  AppDistributionType,
  UpdateCheckResult,
  UpdatePushEvent
} from '../preload/electronApiTypes'
import { GITHUB_CONFIG } from '../config/sharedConstants'
import { isPortableMode } from '../main/portable'

type UpdateEventListener = (event: UpdatePushEvent) => void

export function isNewerVersion(remote: string, local: string): boolean {
  const cleanRemote = remote.replace(/^v/, '').trim()
  const cleanLocal = local.replace(/^v/, '').trim()

  const [remoteMain] = cleanRemote.split('-')
  const [localMain] = cleanLocal.split('-')

  const remoteParts = remoteMain.split('.').map((p) => parseInt(p, 10) || 0)
  const localParts = localMain.split('.').map((p) => parseInt(p, 10) || 0)

  const maxLength = Math.max(remoteParts.length, localParts.length)
  for (let i = 0; i < maxLength; i++) {
    const r = remoteParts[i] ?? 0
    const l = localParts[i] ?? 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

export function parseSha512FromYaml(yamlContent: string, targetFileName?: string): string | null {
  if (!yamlContent) return null

  // 1. If targetFileName is provided, search inside `files:` block first
  if (targetFileName) {
    const lines = yamlContent.split(/\r?\n/)
    let inFiles = false
    let currentItem: { url?: string; sha512?: string } | null = null
    const items: Array<{ url?: string; sha512?: string }> = []

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      const trimmed = line.trim()
      if (/^files:\s*$/.test(trimmed)) {
        inFiles = true
        continue
      }
      if (inFiles) {
        // If we encounter a top-level key that is not a list item and has no leading whitespace, exit files block
        if (
          /^[a-zA-Z0-9_-]+:/.test(trimmed) &&
          !line.startsWith(' ') &&
          !line.startsWith('\t') &&
          !trimmed.startsWith('-')
        ) {
          inFiles = false
          if (currentItem) items.push(currentItem)
          currentItem = null
          continue
        }

        const newListItemMatch = trimmed.match(/^-\s+(.*)$/)
        if (newListItemMatch) {
          if (currentItem) items.push(currentItem)
          currentItem = {}
          const remainder = newListItemMatch[1].trim()
          const urlMatch = remainder.match(/^url:\s*['"]?([^'"]+)['"]?/)
          if (urlMatch) {
            currentItem.url = urlMatch[1].trim()
          }
          const shaMatch = remainder.match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?/)
          if (shaMatch) {
            currentItem.sha512 = shaMatch[1].trim()
          }
          continue
        }

        if (currentItem) {
          const urlMatch = trimmed.match(/^url:\s*['"]?([^'"]+)['"]?/)
          if (urlMatch) {
            currentItem.url = urlMatch[1].trim()
          }
          const shaMatch = trimmed.match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?/)
          if (shaMatch) {
            currentItem.sha512 = shaMatch[1].trim()
          }
        }
      }
    }
    if (currentItem) items.push(currentItem)

    for (const item of items) {
      if (
        item.url &&
        item.sha512 &&
        (item.url === targetFileName ||
          item.url.endsWith(`/${targetFileName}`) ||
          item.url.endsWith(`\\${targetFileName}`))
      ) {
        return item.sha512
      }
    }
  }

  // 2. Check top-level path and sha512
  const pathMatch = yamlContent.match(/^path:\s*['"]?([^'"\r\n]+)['"]?/m)
  const topShaMatch = yamlContent.match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?/m)
  if (topShaMatch) {
    if (!targetFileName || !pathMatch) {
      return topShaMatch[1].trim()
    }
    const pathVal = pathMatch[1].trim()
    if (
      pathVal === targetFileName ||
      pathVal.endsWith(`/${targetFileName}`) ||
      pathVal.endsWith(`\\${targetFileName}`)
    ) {
      return topShaMatch[1].trim()
    }
  }

  return null
}

export function verifyChecksum(computedDigest: Buffer, expectedSha512: string): boolean {
  if (!computedDigest || !expectedSha512) return false
  const expected = expectedSha512.trim()
  const base64Digest = computedDigest.toString('base64')
  const hexDigest = computedDigest.toString('hex')
  return expected === base64Digest || expected.toLowerCase() === hexDigest.toLowerCase()
}

export function formatReleaseNotes(notes: unknown): string | undefined {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((item) => (typeof item === 'string' ? item : (item as { note?: string })?.note || ''))
      .filter(Boolean)
      .join('\n\n')
  }
  return undefined
}

export class UpdateService {
  private static instance: UpdateService | null = null
  private listeners: Set<UpdateEventListener> = new Set()
  private latestUpdateInfo: UpdateInfo | null = null
  private isChecking = false
  private isDownloading = false
  private isDownloaded = false
  private lastCheckResult: UpdateCheckResult | null = null

  private constructor() {
    this.configureUpdater()
  }

  public static getInstance(): UpdateService {
    if (!UpdateService.instance) {
      UpdateService.instance = new UpdateService()
    }
    return UpdateService.instance
  }

  public getAppVersion(): string {
    return app.getVersion()
  }

  public getLastCheckResult(): UpdateCheckResult | null {
    return this.lastCheckResult
  }

  public getUpdateState(): {
    isChecking: boolean
    isDownloading: boolean
    isDownloaded: boolean
  } {
    return {
      isChecking: this.isChecking,
      isDownloading: this.isDownloading,
      isDownloaded: this.isDownloaded
    }
  }

  public getDistributionType(): AppDistributionType {
    if (process.platform === 'win32') {
      return isPortableMode() ? 'win-portable' : 'win-installer'
    }

    if (process.platform === 'linux') {
      return process.env.APPIMAGE ? 'linux-appimage' : 'linux-other'
    }

    return 'win-portable'
  }

  private configureUpdater(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false

    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true
    }

    autoUpdater.on('checking-for-update', () => {
      this.isChecking = true
      this.emit({ event: 'checking', data: null })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.isChecking = false

      if (!isNewerVersion(info.version, this.getAppVersion())) {
        this.latestUpdateInfo = null
        const notAvailableResult: UpdateCheckResult = {
          hasUpdate: false,
          currentVersion: this.getAppVersion(),
          distributionType: this.getDistributionType()
        }
        this.lastCheckResult = notAvailableResult
        this.emit({
          event: 'updateNotAvailable',
          data: {
            currentVersion: this.getAppVersion(),
            distributionType: this.getDistributionType()
          }
        })
        return
      }

      this.latestUpdateInfo = info

      const checkResult: UpdateCheckResult = {
        hasUpdate: true,
        currentVersion: this.getAppVersion(),
        latestVersion: info.version,
        releaseNotes: formatReleaseNotes(info.releaseNotes),
        releaseDate: info.releaseDate,
        distributionType: this.getDistributionType()
      }
      this.lastCheckResult = checkResult
      this.emit({ event: 'updateAvailable', data: checkResult })
    })

    autoUpdater.on('update-not-available', () => {
      this.isChecking = false
      this.latestUpdateInfo = null

      const checkResult: UpdateCheckResult = {
        hasUpdate: false,
        currentVersion: this.getAppVersion(),
        distributionType: this.getDistributionType()
      }
      this.lastCheckResult = checkResult
      this.emit({
        event: 'updateNotAvailable',
        data: {
          currentVersion: this.getAppVersion(),
          distributionType: this.getDistributionType()
        }
      })
    })

    autoUpdater.on('error', (err: Error) => {
      this.isChecking = false
      this.isDownloading = false
      const message = err?.message || 'Unknown update error'
      this.emit({ event: 'error', data: { message } })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.emit({
        event: 'downloadProgress',
        data: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total
        }
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.isDownloading = false
      this.isDownloaded = true
      this.emit({
        event: 'updateDownloaded',
        data: { version: info.version }
      })
    })
  }

  public addListener(listener: UpdateEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: UpdatePushEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('Error in updater event listener:', err)
      }
    }
  }

  public async checkForUpdates(): Promise<UpdateCheckResult> {
    const distType = this.getDistributionType()
    if (this.isChecking && this.lastCheckResult) {
      return this.lastCheckResult
    }
    try {
      this.isChecking = true
      const result = await autoUpdater.checkForUpdates()
      if (result && result.updateInfo) {
        const info = result.updateInfo
        const hasUpdate = isNewerVersion(info.version, this.getAppVersion())
        const checkResult: UpdateCheckResult = {
          hasUpdate,
          currentVersion: this.getAppVersion(),
          latestVersion: hasUpdate ? info.version : undefined,
          releaseNotes: hasUpdate ? formatReleaseNotes(info.releaseNotes) : undefined,
          releaseDate: hasUpdate ? info.releaseDate : undefined,
          distributionType: distType
        }
        this.lastCheckResult = checkResult
        return checkResult
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.warn('Update check failed:', errorMessage)
      return {
        hasUpdate: false,
        currentVersion: this.getAppVersion(),
        distributionType: distType,
        error: errorMessage
      }
    } finally {
      this.isChecking = false
    }

    return (
      this.lastCheckResult ?? {
        hasUpdate: false,
        currentVersion: this.getAppVersion(),
        distributionType: distType
      }
    )
  }

  public async downloadUpdate(): Promise<{ success: boolean; message?: string }> {
    const distType = this.getDistributionType()
    if (distType === 'win-portable') {
      await this.openReleasePage()
      return {
        success: false,
        message: 'Portable version must be downloaded manually from GitHub releases.'
      }
    }

    if (distType === 'linux-appimage' || distType === 'linux-other') {
      return this.downloadLinuxAppImage()
    }

    if (this.isDownloading) {
      return { success: false, message: 'Download already in progress' }
    }

    try {
      this.isDownloading = true
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      this.isDownloading = false
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, message }
    }
  }

  public installUpdate(): void {
    if (this.isDownloaded) {
      autoUpdater.quitAndInstall(false, true)
    }
  }

  public async openReleasePage(version?: string): Promise<void> {
    const owner = GITHUB_CONFIG.OWNER
    const repo = GITHUB_CONFIG.REPO
    let url = `https://github.com/${owner}/${repo}/releases/latest`
    if (version) {
      const cleanVersion = version.startsWith('v') ? version : `v${version}`
      url = `https://github.com/${owner}/${repo}/releases/tag/${cleanVersion}`
    }
    await shell.openExternal(url)
  }

  public getExpectedSha512ForFile(fileName: string): string | null {
    if (!this.latestUpdateInfo) return null
    if (Array.isArray(this.latestUpdateInfo.files)) {
      const file = this.latestUpdateInfo.files.find((f) => {
        if (!f || typeof f.url !== 'string') return false
        return (
          f.url === fileName || f.url.endsWith(`/${fileName}`) || f.url.endsWith(`\\${fileName}`)
        )
      })
      if (file && (file as { sha512?: string }).sha512) {
        return (file as { sha512: string }).sha512
      }
    }
    if (
      this.latestUpdateInfo.path === fileName ||
      (typeof this.latestUpdateInfo.path === 'string' &&
        (this.latestUpdateInfo.path.endsWith(`/${fileName}`) ||
          this.latestUpdateInfo.path.endsWith(`\\${fileName}`)))
    ) {
      return this.latestUpdateInfo.sha512 || null
    }
    return null
  }

  public async fetchLinuxUpdateYml(version: string): Promise<string | null> {
    const cleanVersion = version.replace(/^v/, '')
    const owner = GITHUB_CONFIG.OWNER
    const repo = GITHUB_CONFIG.REPO
    const url = `https://github.com/${owner}/${repo}/releases/download/v${cleanVersion}/latest-linux.yml`
    try {
      return await this.fetchText(url)
    } catch {
      return null
    }
  }

  public fetchText(url: string, redirectCount = 0): Promise<string> {
    if (redirectCount > 10) {
      return Promise.reject(new Error('Too many redirects'))
    }
    return new Promise((resolve, reject) => {
      https
        .get(url, { headers: { 'User-Agent': 'Beatmap-Backup-App' } }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            const redirectUrl = new URL(res.headers.location, url).toString()
            resolve(this.fetchText(redirectUrl, redirectCount + 1))
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Failed to fetch text: HTTP status ${res.statusCode}`))
            return
          }

          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => resolve(data))
          res.on('error', (err) => reject(err))
        })
        .on('error', (err) => reject(err))
    })
  }

  public async downloadLinuxAppImage(
    targetVersion?: string
  ): Promise<{ success: boolean; message?: string }> {
    const version = targetVersion || this.latestUpdateInfo?.version
    if (!version) {
      return { success: false, message: 'No target version available' }
    }

    const cleanVersion = version.replace(/^v/, '')
    const owner = GITHUB_CONFIG.OWNER
    const repo = GITHUB_CONFIG.REPO
    const fileName = `beatmap-backup-${cleanVersion}.AppImage`
    const downloadUrl = `https://github.com/${owner}/${repo}/releases/download/v${cleanVersion}/${fileName}`
    const downloadsDir = app.getPath('downloads')
    const destPath = path.join(downloadsDir, fileName)

    try {
      this.isDownloading = true

      // 1. Resolve expected SHA-512 checksum
      let expectedSha512 = this.getExpectedSha512ForFile(fileName)
      if (!expectedSha512) {
        const ymlContent = await this.fetchLinuxUpdateYml(cleanVersion)
        if (ymlContent) {
          expectedSha512 = parseSha512FromYaml(ymlContent, fileName)
        }
      }

      if (!expectedSha512) {
        throw new Error(`Cannot verify update: SHA-512 checksum not found for ${fileName}`)
      }

      // 2. Download and calculate SHA-512 hash in stream
      this.emit({
        event: 'downloadProgress',
        data: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 100 }
      })

      const computedDigest = await this.downloadFile(
        downloadUrl,
        destPath,
        (transferred, total) => {
          const percent = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0
          this.emit({
            event: 'downloadProgress',
            data: { percent, bytesPerSecond: 0, transferred, total }
          })
        }
      )

      // 3. Verify checksum
      const isChecksumValid = verifyChecksum(computedDigest, expectedSha512)
      if (!isChecksumValid) {
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath)
          }
        } catch {
          // Ignore cleanup error
        }
        throw new Error('Update verification failed: SHA-512 checksum mismatch')
      }

      this.isDownloading = false
      this.isDownloaded = true

      try {
        fs.chmodSync(destPath, 0o755)
      } catch {
        // Ignore chmod errors if filesystem doesn't support it
      }

      this.emit({
        event: 'updateDownloaded',
        data: { version: cleanVersion }
      })

      shell.showItemInFolder(destPath)
      return { success: true }
    } catch (err) {
      this.isDownloading = false
      const message = err instanceof Error ? err.message : String(err)
      this.emit({ event: 'error', data: { message } })
      return { success: false, message }
    }
  }

  private downloadFile(
    url: string,
    destPath: string,
    onProgress: (transferred: number, total: number) => void
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const handleRequest = (currentUrl: string, redirectCount = 0): void => {
        if (redirectCount > 10) {
          reject(new Error('Too many redirects'))
          return
        }

        https
          .get(currentUrl, { headers: { 'User-Agent': 'Beatmap-Backup-App' } }, (res) => {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              const redirectUrl = new URL(res.headers.location, currentUrl).toString()
              handleRequest(redirectUrl, redirectCount + 1)
              return
            }

            if (res.statusCode !== 200) {
              reject(new Error(`Download failed with HTTP status ${res.statusCode}`))
              return
            }

            const total = parseInt(res.headers['content-length'] || '0', 10)
            let transferred = 0
            const fileStream = fs.createWriteStream(destPath)
            const hash = crypto.createHash('sha512')

            res.on('data', (chunk: Buffer) => {
              transferred += chunk.length
              hash.update(chunk)
              onProgress(transferred, total)
            })

            res.pipe(fileStream)

            fileStream.on('finish', () => {
              fileStream.close(() => resolve(hash.digest()))
            })

            fileStream.on('error', (err) => {
              fs.unlink(destPath, () => reject(err))
            })

            res.on('error', (err) => {
              fileStream.destroy()
              fs.unlink(destPath, () => reject(err))
            })
          })
          .on('error', (err) => {
            reject(err)
          })
      }

      handleRequest(url)
    })
  }

  public checkOnStartup(): void {
    setTimeout(() => {
      void this.checkForUpdates()
    }, 4000)
  }
}

export default UpdateService.getInstance()
