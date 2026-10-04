---
trigger: glob
globs: src/main/pathGuards.ts,src/main/ipc/systemIpc.ts,src/services/updateService.ts,src/utils/fileUtils.ts,src/services/settingsStore.ts
---

# Security & Path Safety Rules

Hệ thống desktop Electron có quyền truy cập hệ điều hành cao. Mọi thao tác I/O đường dẫn, gọi shell hệ thống và xử lý thông tin nhạy cảm bắt buộc phải tuân theo các chốt chặn bảo mật dưới đây.

## 1. Shell Execution & File Revelation Guards

Tuyệt đối không gọi trực tiếp các hàm Electron `shell` với đường dẫn hoặc URL chưa qua thẩm định:

1. **`shell.openPath(targetPath)`**:

   - Bắt buộc kiểm tra bằng `isSafeDirectoryToOpen(targetPath)`.
   - Hàm này xác thực: chuỗi không rỗng, đường dẫn tồn tại trên đĩa và bắt buộc phải là **thư mục** (`isDirectory()`).
   - Ngăn chặn người dùng/tệp độc hại kích hoạt thực thi trực tiếp các tệp `.exe`, `.bat`, `.cmd` hoặc binary ngoài ý muốn.

2. **`shell.showItemInFolder(targetPath)`**:

   - Bắt buộc kiểm tra bằng `isSafePathToShow(targetPath)`.
   - Xác thực: đường dẫn hợp lệ và file/thư mục thực sự tồn tại trước khi mở File Explorer.

3. **`shell.openExternal(url)`**:
   - Bắt buộc kiểm tra bằng `isValidExternalUrl(url)`.
   - Chỉ cho phép giao thức `http:` và `https:`.
   - Chặn tuyệt đối `javascript:`, `file:`, `data:`, `vbscript:`, hoặc các custom URI scheme độc hại.
   - Khi renderer mở liên kết ngoài (`webContents.setWindowOpenHandler` hoặc IPC), luôn dùng guard này.

## 2. Path Traversal & Subpath Joining

Khi ứng dụng xử lý file con do người dùng nhập hoặc từ dữ liệu backup/beatmap:

1. **`validateRelativeSubPath(subPath)`**:

   - Kiểm tra chuỗi con không rỗng.
   - Chặn các ký tự wildcard/nguy hiểm: `* ? < > | "`.
   - Chặn đường dẫn tuyệt đối (cả POSIX `/` lẫn Windows `C:\` hoặc `\\unc`).
   - Chặn kỹ thuật Directory Traversal (`..` trong bất kỳ phân đoạn nào).

2. **`safeJoinWithinRoot(rootDir, subPath)`**:

   - Sử dụng khi cần ghép thư mục gốc đã định với tên file/thư mục con.
   - Kiểm tra `relative(normalizedRoot, targetPath)` không bắt đầu bằng `..` và không thoát ra khỏi `rootDir`.

3. **`resolveExistingPathWithinRoot(rootDir, subPath)`**:
   - Sử dụng `fs.promises.realpath` để giải quyết triệt để symlink/junction trỏ ra ngoài thư mục gốc.

## 3. Bảo Vệ Dữ Liệu Nhạy Cảm (Credentials & Tokens)

1. **Beatconnect API Token**:
   - Người dùng nhập token qua Settings → Main process lưu token mã hóa qua `safeStorage.encryptString(token)` và lưu vào `electron-store`.
   - Phía Renderer **tuyệt đối không bao giờ** nhận token thô. Renderer chỉ được gọi `hasBeatconnectToken()` trả về boolean.
   - Main process giải mã runtime qua `safeStorage.decryptString()` và lưu vào bộ nhớ RAM (`_beatconnectRuntimeToken`).
   - Khi ghi log (`logger.ts`) hoặc bắn lỗi ra màn hình, **không bao giờ** in token hoặc header `Token: ...`.

## 4. Ghi Tệp An Toàn (Atomic File Operations)

1. **`atomicWriteFile(targetPath, content, options?)`**:
   - Mọi thao tác lưu dữ liệu quan trọng:
     - Tệp danh sách backup (`.bbak`).
     - Tệp snapshot phục hồi hàng đợi (`download-queue.json.tmp`).
     - Tệp export local beatmap (`.osz`).
   - Bắt buộc phải qua `atomicWriteFile()`: ghi ra một file tạm ngẫu nhiên `.tmp` cùng thư mục, sau đó gọi `fs.promises.rename()` để ghi đè nguyên tử.
   - Loại bỏ hoàn toàn rủi ro file bị rỗng (0 KB) hoặc hỏng định dạng khi mất điện đột ngột hoặc crash ứng dụng.
