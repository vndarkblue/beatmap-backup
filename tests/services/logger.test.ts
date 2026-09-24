import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { logger } from '../../src/services/logger'

describe('AppLogger Service', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'))
    logger.init(tempDir)
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('initializes log directory and creates log file on first write', () => {
    logger.info('Test log line 1')

    const logPath = path.join(tempDir, 'app.log')
    expect(fs.existsSync(logPath)).toBe(true)

    const content = fs.readFileSync(logPath, 'utf-8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('Test log line 1')
  })

  it('records entries in in-memory ring buffer', () => {
    logger.warn('Warning event 1')
    logger.error('Error event 2')

    const recentLogs = logger.getRecentLogs()
    expect(recentLogs.length).toBeGreaterThanOrEqual(2)

    const lastEntry = recentLogs[recentLogs.length - 1]
    expect(lastEntry.level).toBe('ERROR')
    expect(lastEntry.message).toContain('Error event 2')
  })

  it('formats Error objects with stack traces', () => {
    const testError = new Error('Database connection timeout')
    logger.error(testError)

    const logPath = path.join(tempDir, 'app.log')
    const content = fs.readFileSync(logPath, 'utf-8')
    expect(content).toContain('Database connection timeout')
  })

  it('generates a diagnostic snapshot with environment and recent logs', async () => {
    logger.error('[DownloadError] BeatmapSet 99999 failed: HTTP 404')

    const snapshot = await logger.getDiagnosticSnapshot()
    expect(snapshot).toContain('=== Beatmap Backup Diagnostic Info ===')
    expect(snapshot).toContain('OS Platform:')
    expect(snapshot).toContain('--- Path Status ---')
    expect(snapshot).toContain('--- Recent Logs / Errors (Last 15) ---')
    expect(snapshot).toContain('BeatmapSet 99999 failed: HTTP 404')
  })
})
