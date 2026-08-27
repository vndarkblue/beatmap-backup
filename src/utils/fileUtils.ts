import fs from 'fs'
import path from 'path'

/**
 * Writes data to a target file path atomically by first writing to a temporary file
 * in the same directory and then renaming it to the target file.
 * This ensures that if the process is terminated mid-write, the original/target file
 * is never left in a corrupted or partially written state.
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string | NodeJS.ArrayBufferView,
  options?: { encoding?: BufferEncoding; mode?: number }
): Promise<void> {
  const dir = path.dirname(targetPath)
  await fs.promises.mkdir(dir, { recursive: true })

  const uniqueSuffix = `${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
  const tmpPath = `${targetPath}.${uniqueSuffix}.tmp`

  try {
    if (typeof content === 'string') {
      await fs.promises.writeFile(tmpPath, content, {
        encoding: options?.encoding ?? 'utf-8',
        mode: options?.mode
      })
    } else {
      await fs.promises.writeFile(tmpPath, content, {
        mode: options?.mode
      })
    }
    await fs.promises.rename(tmpPath, targetPath)
  } catch (error) {
    try {
      if (fs.existsSync(tmpPath)) {
        await fs.promises.unlink(tmpPath)
      }
    } catch {
      // Ignore cleanup error to preserve the primary error
    }
    throw error
  }
}
