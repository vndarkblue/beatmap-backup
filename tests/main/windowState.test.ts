import { describe, expect, it } from 'vitest'
import {
  getValidWindowState,
  isVisibleOnAnyDisplay,
  WindowDisplay
} from '../../src/main/windowState'
import { WINDOW_CONFIG } from '../../src/config/backendConstants'

describe('windowState logic', () => {
  const primaryDisplay: WindowDisplay = {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 }
  }
  const secondaryDisplay: WindowDisplay = {
    bounds: { x: 1920, y: 0, width: 1920, height: 1080 }
  }

  describe('isVisibleOnAnyDisplay', () => {
    it('returns false when display list is empty', () => {
      expect(
        isVisibleOnAnyDisplay({ x: 100, y: 100, width: 1080, height: 720 }, [])
      ).toBe(false)
    })

    it('returns true when window is well inside primary display', () => {
      expect(
        isVisibleOnAnyDisplay(
          { x: 100, y: 100, width: 1080, height: 720 },
          [primaryDisplay]
        )
      ).toBe(true)
    })

    it('returns true when window is on secondary display', () => {
      expect(
        isVisibleOnAnyDisplay(
          { x: 2000, y: 100, width: 1080, height: 720 },
          [primaryDisplay, secondaryDisplay]
        )
      ).toBe(true)
    })

    it('returns false when window is far offscreen (e.g. unplugged monitor)', () => {
      expect(
        isVisibleOnAnyDisplay(
          { x: 5000, y: 5000, width: 1080, height: 720 },
          [primaryDisplay]
        )
      ).toBe(false)
    })

    it('returns false if overlap is less than 100px', () => {
      // Window positioned so only 50px overlap horizontally
      expect(
        isVisibleOnAnyDisplay(
          { x: 1870, y: 100, width: 1080, height: 720 },
          [primaryDisplay] // bounds 0..1920, overlap is 1920 - 1870 = 50px
        )
      ).toBe(false)
    })
  })

  describe('getValidWindowState', () => {
    it('returns default dimensions when raw state is empty or undefined', () => {
      const state = getValidWindowState(undefined, [primaryDisplay], WINDOW_CONFIG)
      expect(state.width).toBe(WINDOW_CONFIG.DEFAULT_WIDTH)
      expect(state.height).toBe(WINDOW_CONFIG.DEFAULT_HEIGHT)
      expect(state.x).toBeUndefined()
      expect(state.y).toBeUndefined()
      expect(state.isMaximized).toBe(false)
    })

    it('enforces MIN_WIDTH and MIN_HEIGHT', () => {
      const state = getValidWindowState(
        { width: 400, height: 200 },
        [primaryDisplay],
        WINDOW_CONFIG
      )
      expect(state.width).toBe(WINDOW_CONFIG.MIN_WIDTH)
      expect(state.height).toBe(WINDOW_CONFIG.MIN_HEIGHT)
    })

    it('keeps valid custom dimensions and coordinates', () => {
      const state = getValidWindowState(
        { width: 1200, height: 800, x: 200, y: 150, isMaximized: false },
        [primaryDisplay],
        WINDOW_CONFIG
      )
      expect(state.width).toBe(1200)
      expect(state.height).toBe(800)
      expect(state.x).toBe(200)
      expect(state.y).toBe(150)
      expect(state.isMaximized).toBe(false)
    })

    it('omits offscreen x and y while keeping dimensions', () => {
      const state = getValidWindowState(
        { width: 1200, height: 800, x: -3000, y: -3000 },
        [primaryDisplay],
        WINDOW_CONFIG
      )
      expect(state.width).toBe(1200)
      expect(state.height).toBe(800)
      expect(state.x).toBeUndefined()
      expect(state.y).toBeUndefined()
    })

    it('preserves isMaximized flag', () => {
      const state = getValidWindowState(
        { width: 1200, height: 800, isMaximized: true },
        [primaryDisplay],
        WINDOW_CONFIG
      )
      expect(state.isMaximized).toBe(true)
    })
  })
})
