---
trigger: glob
globs: tests/**/*.ts,vitest.config.ts,package.json
---

# Workflow & Testing Verification Rules

Mọi thay đổi trong codebase phải được xác minh nghiêm ngặt trước khi báo cáo hoàn thành cho người dùng. Không được bàn giao mã nguồn khi chưa chạy các bước kiểm tra tương ứng.

## 1. Danh Mục Lệnh Chuẩn & Ý Nghĩa

Môi trường shell mặc định của người dùng là **PowerShell trên Windows**.

| Mục đích                        | Lệnh thực thi                   | Tiêu chí vượt qua (Pass Criteria)                                 |
| :------------------------------ | :------------------------------ | :---------------------------------------------------------------- |
| **Kiểm tra Lint**               | `npm run lint`                  | 0 errors. Không tạo thêm cảnh báo mới.                            |
| **Kiểm tra Kiểu (Toàn diện)**   | `npm run typecheck`             | Pass cả `typecheck:node` (`tsc`) lẫn `typecheck:web` (`vue-tsc`). |
| **Chạy Test cụ thể**            | `npx vitest run <path_to_test>` | Toàn bộ assertion trong test suite đều pass.                      |
| **Chạy Toàn Bộ Test**           | `npm run test`                  | Chạy toàn bộ file test trong thư mục `tests/`.                    |
| **Kiểm tra Test kèm Coverage**  | `npm run test:coverage`         | Vượt qua tất cả ngưỡng tối thiểu trong `vitest.config.ts`.        |
| **Kiểm tra Tổng Thể Cuối Cùng** | `npm run check`                 | Liên hoàn `lint` + `typecheck` + `test:coverage`.                 |

## 2. Ngưỡng Phủ Mã Nguồn Cứng (Coverage Thresholds)

Tệp `vitest.config.ts` quy định ngưỡng tối thiểu bắt buộc đối với các module trọng yếu:

- `src/config/beatmapMirrors.ts`: Statement ≥ 95%, Branch ≥ 95%
- `src/services/beatmapMirrorService.ts`: Statement ≥ 90%, Branch ≥ 75%
- `src/services/database/databaseService.ts`: Statement ≥ 85%, Branch ≥ 57%
- `src/services/download/queuePersistence.ts`: Statement ≥ 90%, Branch ≥ 85%
- `src/services/download/httpDownloader.ts`: Statement ≥ 60%, Branch ≥ 40%
- `src/services/downloadService.ts`: Statement ≥ 25%, Branch ≥ 20%
- `src/main/pathGuards.ts`: Statement ≥ 87%, Branch ≥ 84%

> [!WARNING]
> Nếu bạn thay đổi logic trong bất kỳ file nào thuộc danh sách trên, **bắt buộc phải bổ sung test tương ứng** trong `tests/` để không làm tụt độ phủ dưới ngưỡng. Tuyệt đối không tự ý hạ thấp ngưỡng trong `vitest.config.ts` để qua mặt kiểm tra.

## 3. Xử Lý Vấn Đề Native Module ABI Mismatch

Khi chạy test trên máy phát triển bằng Node.js thuần (Node 22 - ABI 137), các native addon C++ (`better-sqlite3`, `realm`) đã được biên dịch theo ABI của Electron 35 (`NODE_MODULE_VERSION 133`).

- **Hiện tượng**:
  - Chạy `npm run test` có thể gặp lỗi `NODE_MODULE_VERSION mismatch` tại 2 file test nạp binary trực tiếp: `databaseService.test.ts` và `beatmapFilter.test.ts`.
  - Các bài test khác (pathGuards, download, mirrors, i18n, export, fileUtils, parser utils...) vẫn chạy bình thường 100%.
- **Quy tắc ứng xử**:
  - Không tự ý xóa script `postinstall` hay gỡ `better-sqlite3`.
  - Khi thực hiện task không can thiệp SQLite C++ bindings, hãy chạy các test suite liên quan trực tiếp đến tính năng đang làm (ví dụ `npx vitest run tests/services/pathGuards.test.ts`).
  - Trong báo cáo hoàn thành, nêu rõ trạng thái các bài test đã chạy và giải thích nguyên nhân ABI nếu 2 file test database không nạp được trên môi trường Node của host.

## 4. Trình Tự Xác Minh Chuẩn (Step-by-Step Verification)

Trước khi kết thúc task:

1. **Format**: Chạy `npx prettier --write <các_file_đã_sửa>` để code chuẩn convention.
2. **Lint**: Chạy `npm run lint`. Sửa hết mọi lỗi type hoặc syntax mới phát sinh.
3. **Typecheck**: Chạy `npm run typecheck`. Đảm bảo cả code Vue lẫn Node không có lỗi TypeScript.
4. **Test**: Chạy bài test đơn vị của module vừa chỉnh sửa. Nếu sửa logic thuộc phạm vi coverage, chạy `npm run test:coverage`.
5. **i18n (nếu có đổi giao diện)**: Chạy `npx vitest run tests/renderer/i18n.test.ts`.
6. **Tổng hợp**: Chạy `npm run check` (nếu môi trường hỗ trợ đầy đủ) hoặc báo cáo chi tiết các bước đã kiểm tra thành công.
