import { describe, expect, it, vi } from 'vitest'
import { runStartupAutoDetect } from '../../src/services/startupAutoDetect'

const createSettings = (
  overrides?: Partial<{
    stable: string
    lazer: string
    dismissed: boolean
  }>
): {
  getOsuStablePath: () => string
  getOsuLazerPath: () => string
  setOsuStablePath: ReturnType<typeof vi.fn<(next: string) => void>>
  setOsuLazerPath: ReturnType<typeof vi.fn<(next: string) => void>>
  getAutoDetectWarningDismissed: () => boolean
  setAutoDetectWarningDismissed: ReturnType<typeof vi.fn<(next: boolean) => void>>
} => {
  let stable = overrides?.stable ?? ''
  let lazer = overrides?.lazer ?? ''
  let dismissed = overrides?.dismissed ?? false

  return {
    getOsuStablePath: () => stable,
    getOsuLazerPath: () => lazer,
    setOsuStablePath: vi.fn((next: string) => {
      stable = next
    }),
    setOsuLazerPath: vi.fn((next: string) => {
      lazer = next
    }),
    getAutoDetectWarningDismissed: () => dismissed,
    setAutoDetectWarningDismissed: vi.fn((next: boolean) => {
      dismissed = next
    })
  }
}

describe('runStartupAutoDetect', () => {
  it('skips detect for already-valid path and detects missing counterpart', () => {
    const settings = createSettings({ stable: 'stable-valid', lazer: '' })
    const detectStablePath = vi.fn(() => 'should-not-be-used')
    const detectLazerPath = vi.fn(() => '/detected/lazer')

    const result = runStartupAutoDetect({
      settings,
      detectStablePath,
      detectLazerPath,
      isStablePathValid: (value) => value === 'stable-valid',
      isLazerPathValid: (value) => value === '/detected/lazer'
    })

    expect(detectStablePath).not.toHaveBeenCalled()
    expect(detectLazerPath).toHaveBeenCalledOnce()
    expect(settings.setOsuLazerPath).toHaveBeenCalledWith('/detected/lazer')
    expect(result).toEqual({
      didUpdateStablePath: false,
      didUpdateLazerPath: true,
      showWarning: false
    })
  })

  it('shows warning one-time when detect fails first time', () => {
    const settings = createSettings({ stable: '', lazer: '', dismissed: false })
    const result = runStartupAutoDetect({
      settings,
      detectStablePath: () => null,
      detectLazerPath: () => null,
      isStablePathValid: () => false,
      isLazerPathValid: () => false
    })

    expect(result.showWarning).toBe(true)
    expect(settings.setAutoDetectWarningDismissed).toHaveBeenCalledWith(true)
  })

  it('does not show warning again after dismissal flag is already set', () => {
    const settings = createSettings({ stable: '', lazer: '', dismissed: true })
    const result = runStartupAutoDetect({
      settings,
      detectStablePath: () => null,
      detectLazerPath: () => null,
      isStablePathValid: () => false,
      isLazerPathValid: () => false
    })

    expect(result.showWarning).toBe(false)
    expect(settings.setAutoDetectWarningDismissed).not.toHaveBeenCalled()
  })
})
