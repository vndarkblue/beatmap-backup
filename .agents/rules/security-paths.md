---
trigger: glob
globs: src/main/pathGuards.ts,src/main/ipc/systemIpc.ts,src/services/updateService.ts,src/utils/fileUtils.ts,src/services/settingsStore.ts
---

# Security & Path Safety Rules

The Electron desktop application operates with elevated operating system privileges. All filesystem path I/O,
system shell executions, and handling of sensitive credentials must strictly adhere to the security checkpoints below.

## 1. Shell Execution & File Revelation Guards

Never invoke Electron `shell` methods with unvalidated paths or URLs:

1. **`shell.openPath(targetPath)`**:
   - Must validate using `isSafeDirectoryToOpen(targetPath)`.
   - Validates that the string is non-empty, exists on disk, and is strictly a **directory** (`isDirectory()`).
   - Prevents users or malicious files from directly executing arbitrary `.exe`, `.bat`, `.cmd`, or binary payloads.

2. **`shell.showItemInFolder(targetPath)`**:
   - Must validate using `isSafePathToShow(targetPath)`.
   - Validates that the path string is safe and the file/directory actually exists on disk before launching File Explorer.

3. **`shell.openExternal(url)`**:
   - Must validate using `isValidExternalUrl(url)`.
   - Exclusively permits `http:` and `https:` protocols.
   - Strictly rejects `javascript:`, `file:`, `data:`, `vbscript:`, and malicious custom URI schemes.
   - Always apply this guard when renderer opens external links (`webContents.setWindowOpenHandler` or IPC).

## 2. Path Traversal & Subpath Joining

When handling subpaths supplied by user input or parsed from beatmap/backup metadata:

1. **`validateRelativeSubPath(subPath)`**:
   - Validates non-empty strings.
   - Rejects wildcard/illegal characters: `* ? < > | "`.
   - Rejects absolute paths (both POSIX `/` and Windows drive letters or `\\unc` paths).
   - Prevents Directory Traversal attacks (`..` in any path segment).

2. **`safeJoinWithinRoot(rootDir, subPath)`**:
   - Used when joining a trusted base root with a relative subpath.
   - Verifies that `relative(normalizedRoot, targetPath)` does not begin with `..` and does not escape `rootDir`.

3. **`resolveExistingPathWithinRoot(rootDir, subPath)`**:
   - Uses `fs.promises.realpath` to resolve and prevent symlinks or directory junctions from traversing outside the root directory.

## 3. Protecting Sensitive Data (Credentials & Tokens)

1. **Beatconnect API Token**:
   - When entered via Settings, Main process persists the token encrypted using `safeStorage.encryptString(token)` into `electron-store`.
   - The Renderer **must never** receive raw tokens. It may only call `hasBeatconnectToken()`, which returns a boolean.
   - The Main process decrypts the token at runtime via `safeStorage.decryptString()` into memory RAM (`_beatconnectRuntimeToken`).
   - When writing logs (`logger.ts`) or emitting errors, **never** output raw tokens or the `Token: ...` header.

## 4. Safe File Writing (Atomic File Operations)

1. **`atomicWriteFile(targetPath, content, options?)`**:
   - All critical persistence operations:
     - Backup files (`.bbak`).
     - Download queue recovery snapshots (`download-queue.json.tmp`).
     - Exported local beatmaps (`.osz`).
   - Must be written using `atomicWriteFile()`: writes to a temporary file (`.tmp`) in the same directory, followed by an atomic `fs.promises.rename()`.
   - Eliminates the risk of zero-byte (0 KB) files or corrupted states during unexpected application crashes or power loss.
