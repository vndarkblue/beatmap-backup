import path from 'path'

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

  if (path.isAbsolute(trimmed)) {
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
