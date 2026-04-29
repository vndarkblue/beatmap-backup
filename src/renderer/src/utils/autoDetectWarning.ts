export type AutoDetectStatusPayload = {
  showWarning?: unknown
}

export function shouldShowAutoDetectWarning(payload: AutoDetectStatusPayload | null): boolean {
  return Boolean(payload && payload.showWarning === true)
}
