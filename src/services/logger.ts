import fs from 'fs'
import path from 'path'
import os from 'os'
import { app } from 'electron'
import { isPortableMode } from '../main/portable'
import { getSettings } from './settingsStore'

export interface LogEntry {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL'
  message: string
}

const MAX_LOG_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_RING_BUFFER_ENTRIES = 25

class AppLogger {
  private static instance: AppLogger | null = null
  private logDir: string = ''
  private logFilePath: string = ''
  private oldLogFilePath: string = ''
  private ringBuffer: LogEntry[] = []
  private initialized: boolean = false
  private currentFileSize: number = 0

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): AppLogger {
    if (!AppLogger.instance) {
      AppLogger.instance = new AppLogger()
    }
    return AppLogger.instance
  }

  public init(customLogDir?: string): void {
    if (this.initialized && !customLogDir) return

    try {
      if (customLogDir) {
        this.logDir = customLogDir
      } else if (app?.getPath) {
        this.logDir = path.join(app.getPath('userData'), 'logs')
      } else {
        const fallbackRoot = process.env.APPDATA || os.tmpdir()
        this.logDir = path.join(fallbackRoot, 'osu-beatmap-backup', 'logs')
      }

      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }

      this.logFilePath = path.join(this.logDir, 'app.log')
      this.oldLogFilePath = path.join(this.logDir, 'app.old.log')

      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath)
        this.currentFileSize = stats.size
      } else {
        this.currentFileSize = 0
      }

      if (!this.initialized) {
        this.hookProcessErrors()
        this.hookConsole()
        this.initialized = true
      }

      this.info(
        `Logger initialized. Platform=${process.platform} Arch=${process.arch} PID=${process.pid}`
      )
    } catch (err) {
      // Fallback: console only if filesystem fails
      console.error('Failed to initialize AppLogger:', err)
    }
  }

  public getLogDir(): string {
    if (!this.logDir) {
      try {
        if (app?.getPath) {
          return path.join(app.getPath('userData'), 'logs')
        }
      } catch {
        // ignore
      }
      return path.join(os.tmpdir(), 'osu-beatmap-backup', 'logs')
    }
    return this.logDir
  }

  public getRecentLogs(): LogEntry[] {
    return [...this.ringBuffer]
  }

  private formatArgs(message: unknown, ...meta: unknown[]): string {
    const parts: string[] = []

    if (message instanceof Error) {
      parts.push(message.stack || `${message.name}: ${message.message}`)
    } else if (typeof message === 'object' && message !== null) {
      try {
        parts.push(JSON.stringify(message))
      } catch {
        parts.push(String(message))
      }
    } else {
      parts.push(String(message ?? ''))
    }

    for (const item of meta) {
      if (item instanceof Error) {
        parts.push(item.stack || `${item.name}: ${item.message}`)
      } else if (typeof item === 'object' && item !== null) {
        try {
          parts.push(JSON.stringify(item))
        } catch {
          parts.push(String(item))
        }
      } else {
        parts.push(String(item ?? ''))
      }
    }

    return parts.join(' ')
  }

  private write(level: LogEntry['level'], text: string): void {
    const timestamp = new Date().toISOString()
    const entry: LogEntry = { timestamp, level, message: text }

    // Always keep in-memory ring buffer
    this.ringBuffer.push(entry)
    if (this.ringBuffer.length > MAX_RING_BUFFER_ENTRIES) {
      this.ringBuffer.shift()
    }

    if (!this.logFilePath) return

    const line = `[${timestamp}] [${level}] ${text}\n`
    const lineBytes = Buffer.byteLength(line, 'utf-8')

    try {
      if (this.currentFileSize + lineBytes > MAX_LOG_SIZE_BYTES) {
        this.rotateLogs()
      }

      fs.appendFileSync(this.logFilePath, line, 'utf-8')
      this.currentFileSize += lineBytes
    } catch {
      // Avoid infinite loop if writing to disk fails
    }
  }

  private rotateLogs(): void {
    try {
      if (fs.existsSync(this.oldLogFilePath)) {
        fs.unlinkSync(this.oldLogFilePath)
      }
      if (fs.existsSync(this.logFilePath)) {
        fs.renameSync(this.logFilePath, this.oldLogFilePath)
      }
      this.currentFileSize = 0
    } catch {
      // Rotation failed, truncate current log
      try {
        fs.writeFileSync(this.logFilePath, '', 'utf-8')
        this.currentFileSize = 0
      } catch {
        // Ignore
      }
    }
  }

  public info(message: unknown, ...meta: unknown[]): void {
    this.write('INFO', this.formatArgs(message, ...meta))
  }

  public warn(message: unknown, ...meta: unknown[]): void {
    this.write('WARN', this.formatArgs(message, ...meta))
  }

  public error(message: unknown, ...meta: unknown[]): void {
    this.write('ERROR', this.formatArgs(message, ...meta))
  }

  public fatal(message: unknown, ...meta: unknown[]): void {
    this.write('FATAL', this.formatArgs(message, ...meta))
  }

  private hookConsole(): void {
    const originalError = console.error.bind(console)
    const originalWarn = console.warn.bind(console)

    console.error = (message?: unknown, ...optionalParams: unknown[]) => {
      this.error(message, ...optionalParams)
      originalError(message, ...optionalParams)
    }

    console.warn = (message?: unknown, ...optionalParams: unknown[]) => {
      this.warn(message, ...optionalParams)
      originalWarn(message, ...optionalParams)
    }
  }

  private hookProcessErrors(): void {
    process.on('uncaughtException', (err: Error) => {
      this.fatal('Uncaught Exception in main process:', err)
    })

    process.on('unhandledRejection', (reason: unknown) => {
      this.fatal('Unhandled Promise Rejection in main process:', reason)
    })
  }

  public async getDiagnosticSnapshot(): Promise<string> {
    const now = new Date().toISOString()
    const appVer = app?.getVersion ? app.getVersion() : 'unknown'
    const isPackaged = app?.isPackaged ?? false
    const distType = isPortableMode() ? 'win-portable' : 'win-installer'

    let stablePathConfigured = false
    let lazerPathConfigured = false

    try {
      const settings = getSettings()
      stablePathConfigured = Boolean(
        settings.osuStablePath && fs.existsSync(settings.osuStablePath)
      )
      lazerPathConfigured = Boolean(
        settings.osuLazerResolvedDataPath && fs.existsSync(settings.osuLazerResolvedDataPath)
      )
    } catch {
      // ignore
    }

    const lines: string[] = [
      '=== Beatmap Backup Diagnostic Info ===',
      `Timestamp: ${now}`,
      `App Version: v${appVer} (${distType}, Packaged: ${isPackaged})`,
      `OS Platform: ${process.platform} (${os.release()} ${process.arch})`,
      `Electron: ${process.versions.electron || 'unknown'} | Chrome: ${process.versions.chrome || 'unknown'} | Node: ${process.versions.node || 'unknown'}`,
      '',
      '--- Path Status ---',
      `osu!stable Path Configured: ${stablePathConfigured ? 'Valid' : 'Not Set / Missing'}`,
      `osu!lazer Path Configured: ${lazerPathConfigured ? 'Valid' : 'Not Set / Missing'}`,
      '',
      '--- Recent Logs / Errors (Last 15) ---'
    ]

    const recentLogs = this.ringBuffer.slice(-15)
    if (recentLogs.length === 0) {
      lines.push('(No recent errors recorded)')
    } else {
      for (const entry of recentLogs) {
        lines.push(
          `[${entry.timestamp.split('T')[1]?.replace('Z', '')}] [${entry.level}] ${entry.message}`
        )
      }
    }

    return lines.join('\n')
  }
}

import { is } from '../utils/env'

const START_MS = Date.now()

export function startupMark(label: string, extra?: Record<string, unknown>): void {
  if (!is.dev) return

  const deltaMs = Date.now() - START_MS
  const suffix = extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : ''
  console.log(`[startup +${deltaMs}ms] ${label}${suffix}`)
}

export const logger = AppLogger.getInstance()
export default logger
