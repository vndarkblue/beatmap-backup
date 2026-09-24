import { app } from 'electron'
import path from 'path'
import fs from 'fs'

/**
 * Checks if the application is running in portable mode.
 * Criteria on Windows:
 * 1. CLI switch `--portable` or environment variable `PORTABLE=true` (convenient for testing)
 * 2. Standard electron-builder portable environment variables (PORTABLE_EXECUTABLE_DIR / PORTABLE_EXECUTABLE_FILE)
 * 3. Packaged app without an NSIS uninstaller (e.g. unzipped portable release / win-unpacked)
 */
export function isPortableMode(): boolean {
  if (app?.commandLine?.hasSwitch && app.commandLine.hasSwitch('portable')) {
    return true
  }

  if (process.env.PORTABLE === 'true' || process.env.PORTABLE === '1') {
    return true
  }

  if (process.platform === 'win32') {
    if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) {
      return true
    }

    if (!app?.isPackaged) {
      return false
    }

    const exeDir = path.dirname(process.execPath)
    const uninstallerPath = path.join(exeDir, 'Uninstall Beatmap Backup.exe')
    return !fs.existsSync(uninstallerPath)
  }

  return false
}

/**
 * Gets the root directory for portable storage.
 */
export function getPortableRootDir(): string {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return process.env.PORTABLE_EXECUTABLE_DIR
  }
  return path.dirname(process.execPath)
}

/**
 * Initializes portable userData path if running in portable mode.
 * This redirects all user data (settings, databases, local storage, cache)
 * into a `data/` folder next to the executable.
 *
 * MUST be executed as early as possible before app.whenReady() and before
 * any module initializes electron-store or accesses app.getPath('userData').
 */
export function setupPortableUserData(): void {
  if (!isPortableMode()) {
    return
  }

  const rootDir = getPortableRootDir()
  const portableDataPath = path.join(rootDir, 'data')

  try {
    fs.mkdirSync(portableDataPath, { recursive: true })

    // Verify write permission
    const testFile = path.join(portableDataPath, '.writable-check')
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)

    if (typeof app?.setPath === 'function') {
      app.setPath('userData', portableDataPath)
    }
  } catch (err) {
    console.warn('Failed to configure portable userData path, falling back to default:', err)
  }
}
