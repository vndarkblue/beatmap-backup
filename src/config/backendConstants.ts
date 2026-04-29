import { API_PORT, API_ROUTE_PATHS } from './sharedConstants'

export const BACKEND_SERVER = {
  PORT: API_PORT
} as const

export const WINDOW_CONFIG = {
  DEFAULT_WIDTH: 950,
  DEFAULT_HEIGHT: 670,
  MIN_WIDTH: 700,
  MIN_HEIGHT: 300
} as const

export const BACKEND_API_ROUTES = API_ROUTE_PATHS
