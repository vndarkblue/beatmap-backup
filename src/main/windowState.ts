import { BrowserWindow, screen } from 'electron'
import Store from 'electron-store'
import { WINDOW_CONFIG } from '../config/appConstants'
import { logger } from '../services/logger'

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

export interface WindowDisplay {
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
}

// @ts-ignore - Store type definition is incomplete in electron-store package
const windowStateStore = new Store<WindowState>({
  name: 'window-state',
  defaults: {
    width: WINDOW_CONFIG.DEFAULT_WIDTH,
    height: WINDOW_CONFIG.DEFAULT_HEIGHT,
    isMaximized: false
  }
})

/**
 * Checks if at least 100px overlap exists between the window and any active display.
 */
export function isVisibleOnAnyDisplay(
  bounds: { x: number; y: number; width: number; height: number },
  displays: WindowDisplay[]
): boolean {
  if (!displays || displays.length === 0) return false
  const minVisiblePixels = 100
  return displays.some((display) => {
    const d = display.bounds
    const horizontalOverlap = Math.max(
      0,
      Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x)
    )
    const verticalOverlap = Math.max(
      0,
      Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y)
    )
    return horizontalOverlap >= minVisiblePixels && verticalOverlap >= minVisiblePixels
  })
}

/**
 * Validates and sanitizes window state against active displays and window constraints.
 */
export function getValidWindowState(
  rawState: Partial<WindowState> | null | undefined,
  displays: WindowDisplay[],
  config: {
    DEFAULT_WIDTH: number
    DEFAULT_HEIGHT: number
    MIN_WIDTH: number
    MIN_HEIGHT: number
  } = WINDOW_CONFIG
): WindowState {
  const width =
    typeof rawState?.width === 'number' && Number.isFinite(rawState.width)
      ? Math.max(config.MIN_WIDTH, Math.round(rawState.width))
      : config.DEFAULT_WIDTH

  const height =
    typeof rawState?.height === 'number' && Number.isFinite(rawState.height)
      ? Math.max(config.MIN_HEIGHT, Math.round(rawState.height))
      : config.DEFAULT_HEIGHT

  const isMaximized = Boolean(rawState?.isMaximized)

  let x: number | undefined
  let y: number | undefined

  if (
    typeof rawState?.x === 'number' &&
    Number.isFinite(rawState.x) &&
    typeof rawState?.y === 'number' &&
    Number.isFinite(rawState.y)
  ) {
    if (isVisibleOnAnyDisplay({ x: rawState.x, y: rawState.y, width, height }, displays)) {
      x = Math.round(rawState.x)
      y = Math.round(rawState.y)
    }
  }

  return { width, height, x, y, isMaximized }
}

/**
 * Reads persisted window state and validates coordinates against active displays.
 */
export function restoreWindowState(): WindowState {
  try {
    const rawState = windowStateStore.store
    const displays = typeof screen?.getAllDisplays === 'function' ? screen.getAllDisplays() : []
    return getValidWindowState(rawState, displays, WINDOW_CONFIG)
  } catch (error) {
    logger.warn('Failed to restore window state, falling back to defaults:', error)
    return {
      width: WINDOW_CONFIG.DEFAULT_WIDTH,
      height: WINDOW_CONFIG.DEFAULT_HEIGHT,
      isMaximized: false
    }
  }
}

function saveStateSync(state: WindowState): void {
  try {
    windowStateStore.set('width', state.width)
    windowStateStore.set('height', state.height)
    if (typeof state.x === 'number') {
      windowStateStore.set('x', state.x)
    } else {
      windowStateStore.delete('x' as never)
    }
    if (typeof state.y === 'number') {
      windowStateStore.set('y', state.y)
    } else {
      windowStateStore.delete('y' as never)
    }
    windowStateStore.set('isMaximized', state.isMaximized)
  } catch (error) {
    logger.warn('Failed to persist window state:', error)
  }
}

/**
 * Tracks window position, dimensions and maximized state, debouncing writes to storage.
 */
export function manageWindowState(
  mainWindow: BrowserWindow,
  initialState?: WindowState
): () => void {
  const currentState: WindowState = {
    width: initialState?.width ?? WINDOW_CONFIG.DEFAULT_WIDTH,
    height: initialState?.height ?? WINDOW_CONFIG.DEFAULT_HEIGHT,
    x: initialState?.x,
    y: initialState?.y,
    isMaximized: initialState?.isMaximized ?? false
  }

  let debounceTimer: NodeJS.Timeout | null = null

  const saveStateDebounced = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      saveStateSync(currentState)
    }, 300)
  }

  const updateNormalBounds = (): void => {
    if (mainWindow.isDestroyed()) return
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds()
      currentState.width = bounds.width
      currentState.height = bounds.height
      currentState.x = bounds.x
      currentState.y = bounds.y
      currentState.isMaximized = false
      saveStateDebounced()
    }
  }

  const onMaximize = (): void => {
    currentState.isMaximized = true
    saveStateDebounced()
  }

  const onUnmaximize = (): void => {
    currentState.isMaximized = false
    updateNormalBounds()
  }

  const onClose = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (!mainWindow.isDestroyed()) {
      const isMax = mainWindow.isMaximized()
      currentState.isMaximized = isMax
      if (!isMax && !mainWindow.isMinimized()) {
        const bounds = mainWindow.getBounds()
        currentState.width = bounds.width
        currentState.height = bounds.height
        currentState.x = bounds.x
        currentState.y = bounds.y
      }
      saveStateSync(currentState)
    }
  }

  mainWindow.on('resize', updateNormalBounds)
  mainWindow.on('move', updateNormalBounds)
  mainWindow.on('maximize', onMaximize)
  mainWindow.on('unmaximize', onUnmaximize)
  mainWindow.on('close', onClose)

  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (!mainWindow.isDestroyed()) {
      mainWindow.removeListener('resize', updateNormalBounds)
      mainWindow.removeListener('move', updateNormalBounds)
      mainWindow.removeListener('maximize', onMaximize)
      mainWindow.removeListener('unmaximize', onUnmaximize)
      mainWindow.removeListener('close', onClose)
    }
  }
}
