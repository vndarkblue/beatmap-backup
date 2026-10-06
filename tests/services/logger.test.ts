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
    logger.clearRingBufferForTest()
  })

  afterEach(() => {
    logger.clearRingBufferForTest()
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
    expect(recentLogs).toHaveLength(2)

    expect(recentLogs[0].level).toBe('WARN')
    expect(recentLogs[0].message).toContain('Warning event 1')
    expect(recentLogs[1].level).toBe('ERROR')
    expect(recentLogs[1].message).toContain('Error event 2')
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

  it('rotates log file when size exceeds MAX_LOG_SIZE_BYTES', () => {
    logger.info('Pre-rotation message')
    const logPath = path.join(tempDir, 'app.log')
    const oldLogPath = path.join(tempDir, 'app.old.log')

    // Simulate file reaching MAX_LOG_SIZE_BYTES (2MB)
    ;(logger as unknown as { currentFileSize: number }).currentFileSize = 2 * 1024 * 1024

    logger.info('Post-rotation message')

    expect(fs.existsSync(oldLogPath)).toBe(true)
    expect(fs.existsSync(logPath)).toBe(true)
    const oldContent = fs.readFileSync(oldLogPath, 'utf-8')
    const newContent = fs.readFileSync(logPath, 'utf-8')
    expect(oldContent).toContain('Pre-rotation message')
    expect(newContent).toContain('Post-rotation message')
  })
})
