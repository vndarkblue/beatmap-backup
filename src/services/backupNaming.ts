import path from 'path'

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
])

export const getBackupDateStamp = (date: Date = new Date()): string =>
  date.toISOString().slice(0, 10).replace(/-/g, '')

export const sanitizeBackupFileName = (raw: string, fallback = 'backup'): string => {
  const withoutControls = Array.from(raw)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  const cleaned = withoutControls
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)

  const safeFallback = fallback.trim() || 'backup'
  const safeName = cleaned.length > 0 ? cleaned : safeFallback
  if (WINDOWS_RESERVED_NAMES.has(safeName.toUpperCase())) {
    return `${safeName}_backup`
  }
  return safeName
}

export const buildBackupBaseName = (nameSeed = 'backup', date: Date = new Date()): string =>
  `${sanitizeBackupFileName(nameSeed)}-${getBackupDateStamp(date)}`

export const buildBackupFileName = (nameSeed = 'backup', date: Date = new Date()): string =>
  `${buildBackupBaseName(nameSeed, date)}.bbak`

export const buildLocalOszDirectoryName = (nameSeed = 'backup', date: Date = new Date()): string =>
  buildBackupBaseName(nameSeed, date)

export const getBackupBaseNameFromFilePath = (filePath: string): string =>
  path.basename(filePath, path.extname(filePath))
