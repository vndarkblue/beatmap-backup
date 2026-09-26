import path from 'path'
import fs from 'fs'

export function isValidExternalUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string') return false
  try {
    const parsed = new URL(rawUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function isSafeDirectoryToOpen(targetPath: string): boolean {
  if (typeof targetPath !== 'string' || !targetPath.trim()) return false
  try {
    const resolved = path.resolve(targetPath.trim())
    return fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()
  } catch {
    return false
  }
}

export function isSafePathToShow(targetPath: string): boolean {
  if (typeof targetPath !== 'string' || !targetPath.trim()) return false
  try {
    const resolved = path.resolve(targetPath.trim())
    return fs.existsSync(resolved)
  } catch {
    return false
  }
}

const DISALLOWED_SUB_PATH_CHARS = /[*?<>|"]/

function hasParentTraversal(input: string): boolean {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment === '..')
}

export function validateRelativeSubPath(input: string): { valid: boolean; reason?: string } {
  if (typeof input !== 'string') {
    return { valid: false, reason: 'Sub path must be a string' }
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return { valid: false, reason: 'Sub path is empty' }
  }

  if (DISALLOWED_SUB_PATH_CHARS.test(trimmed)) {
    return { valid: false, reason: 'Sub path contains invalid wildcard characters' }
  }

  if (
    path.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed) ||
    path.posix.isAbsolute(trimmed)
  ) {
    return { valid: false, reason: 'Sub path must be relative' }
  }

  if (hasParentTraversal(trimmed)) {
    return { valid: false, reason: 'Sub path traversal is not allowed' }
  }

  return { valid: true }
}

export function safeJoinWithinRoot(
  rootDir: string,
  subPath: string
): { valid: boolean; joinedPath?: string } {
  if (typeof rootDir !== 'string' || !rootDir.trim()) {
    return { valid: false }
  }

  const validation = validateRelativeSubPath(subPath)
  if (!validation.valid) {
    return { valid: false }
  }

  const normalizedRoot = path.resolve(rootDir)
  const targetPath = path.resolve(normalizedRoot, subPath)
  const relativeToRoot = path.relative(normalizedRoot, targetPath)
  const escapesRoot = relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)

  if (escapesRoot) {
    return { valid: false }
  }

  return { valid: true, joinedPath: targetPath }
}

export async function resolveExistingPathWithinRoot(
  rootDir: string,
  subPath: string
): Promise<{ valid: boolean; resolvedPath?: string }> {
  const safePath = safeJoinWithinRoot(rootDir, subPath)
  if (!safePath.valid || !safePath.joinedPath) {
    return { valid: false }
  }

  try {
    const resolvedRoot = await fs.promises.realpath(path.resolve(rootDir))
    const resolvedTarget = await fs.promises.realpath(safePath.joinedPath)
    const relativeToRoot = path.relative(resolvedRoot, resolvedTarget)
    const escapesRoot = relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)

    if (escapesRoot) {
      return { valid: false }
    }

    return { valid: true, resolvedPath: resolvedTarget }
  } catch {
    return { valid: false }
  }
}
