/**
 * Extracts a readable "Artist - Title" string from an .osz filename if present.
 * For example:
 * - "182958 Sasaki Sayaka - Marine Blue ni Sotte.osz" -> "Sasaki Sayaka - Marine Blue ni Sotte"
 * - "[182958] Artist - Title.osz" -> "Artist - Title"
 * - "Artist - Title.osz" -> "Artist - Title"
 * Returns null if the filename is purely numeric or missing title metadata (e.g. "182958.osz").
 */
export function parseTitleFromFileName(fileName?: string): string | null {
  if (!fileName) return null

  // Remove .osz extension and extra spaces
  const withoutExt = fileName.replace(/\.osz$/i, '').trim()

  // If the filename without extension is just digits (e.g. "182958" or "182958 (1)")
  if (/^\d+(\s*\(\d+\))?$/.test(withoutExt)) {
    return null
  }

  // Remove leading numbers / brackets e.g. "182958 ", "[182958] ", "182958 - "
  const stripped = withoutExt.replace(/^(?:\[?\d+\]?\s*[-_ ]\s*|\d+\s+)/, '').trim()

  // If empty or only digits or duplicate suffix like "(1)"
  if (!stripped || /^(\(\d+\)|\d+(\s*\(\d+\))?)$/.test(stripped)) {
    return null
  }

  return stripped
}
