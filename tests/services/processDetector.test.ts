import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockExec = vi.fn()

vi.mock('child_process', () => ({
  exec: (
    cmd: string,
    options: unknown,
    callback: (err: unknown, result?: { stdout: string }) => void
  ) => {
    mockExec(cmd, options, callback)
  }
}))

vi.mock('../../../src/services/settingsStore', () => ({
  getOsuStablePath: () => 'C:/osu',
  getOsuLazerPath: () => 'C:/osu-lazer'
}))

describe('processDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detects running osu!.exe on Windows', async () => {
    mockExec.mockImplementation((_cmd, _opts, cb) => {
      cb(null, {
        stdout:
          '"osu!.exe","1234","Console","1","50,000 K"\n"chrome.exe","5678","Console","1","100,000 K"'
      })
    })

    const { isOsuProcessRunning } = await import('../../../src/services/processDetector')
    const result = await isOsuProcessRunning('stable')
    expect(result.running).toBe(true)
    expect(result.client).toBe('stable')
  })

  it('returns running false when no osu process is active', async () => {
    mockExec.mockImplementation((_cmd, _opts, cb) => {
      cb(null, { stdout: '"chrome.exe","5678","Console","1","100,000 K"' })
    })

    const { isOsuProcessRunning } = await import('../../../src/services/processDetector')
    const result = await isOsuProcessRunning('stable')
    expect(result.running).toBe(false)
  })

  it('detects running osu!lazer on Windows', async () => {
    mockExec.mockImplementation((_cmd, _opts, cb) => {
      cb(null, { stdout: '"osu!lazer.exe","4321","Console","1","80,000 K"' })
    })

    const { isOsuProcessRunning } = await import('../../../src/services/processDetector')
    const result = await isOsuProcessRunning('lazer')
    expect(result.running).toBe(true)
    expect(result.client).toBe('lazer')
  })
})
