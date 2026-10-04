---
trigger: glob
globs: src/services/download/**/*.ts,src/services/downloadService.ts,src/config/beatmapMirrors.ts
---

# Downloads & Beatmap Mirrors Rules

Hệ thống tải beatmap sử dụng kiến trúc HTTP stream đa luồng, hỗ trợ luân chuyển mirror thông minh, kiểm tra tính toàn vẹn của tệp `.osz` và lưu snapshot hàng đợi.

## 1. Giới Hạn Tốc Độ (Rate Limit) Bắt Buộc

Tuyệt đối không tăng hoặc loại bỏ các hằng số giới hạn rate-limit dưới bất kỳ hình thức nào. Vi phạm sẽ dẫn đến việc IP của người dùng bị mirror cấm vĩnh viễn:

| Mirror                   | Điều kiện                    | Concurrency tối đa                       | Khoảng cách dispatch tối thiểu | Giới hạn theo phút      |
| :----------------------- | :--------------------------- | :--------------------------------------- | :----------------------------- | :---------------------- |
| **Mino (`catboy.best`)** | Chung                        | **2**                                    | **600ms**                      | Tối đa 60 requests/phút |
| **BeatConnect**          | Có API Token                 | **5**                                    | **150ms**                      | Theo quota token        |
| **BeatConnect**          | Không có Token               | **2**                                    | **800ms**                      | -                       |
| **Các mirror khác**      | osu.direct, NeriNyan, Nekoha | **3** (`DEFAULT_MIRROR_MAX_CONCURRENCY`) | Dynamic                        | -                       |

> [!CAUTION]
> Ngay cả khi người dùng thiết lập `downloadThreadCount = 10` trong cài đặt, tổng số luồng tải cho từng mirror riêng lẻ **không bao giờ** được vượt quá `getMirrorMaxConcurrencyCap(mirrorName)`.

## 2. Quản Lý Lỗi & Cooldown Cơ Chế Tự Động

1. **HTTP 429 (Rate Limited)**:
   - Kích hoạt cooldown cho mirror tương ứng (`BASE_RATE_LIMIT_COOLDOWN_MS = 5000` nhân đôi dần, tối đa `60000ms`).
   - Tự động chuyển task sang mirror dự phòng tiếp theo trong danh sách ưu tiên.
2. **HTTP 401 (Unauthorized trên BeatConnect)**:
   - Phân loại lỗi là `auth-invalid`.
   - Lập tức xóa runtime token (`setBeatconnectRuntimeToken('')`), hạ concurrency cap về `BEATCONNECT_UNAUTH_MAX_CONCURRENCY` (2 luồng) và dispatch interval về 800ms.
   - Chuyển trạng thái task về `waiting` để tiếp tục tải dưới quyền khách.
3. **HTTP 404 (Not Found)**:
   - Phân loại `not-found`. Nếu tất cả các mirror đều trả về 404, beatmapset được đánh dấu `error` vĩnh viễn.

## 3. Tải Xuống Stream & Kiểm Tra Tính Toàn Vẹn (.osz Integrity)

1. **Ghi đĩa an toàn bằng Stream**:
   - Sử dụng `httpDownloader.ts` pipe stream trực tiếp xuống tệp tạm (`.osz.download`).
   - Không nạp toàn bộ file beatmap vài chục MB vào bộ nhớ RAM Buffer.
2. **Kiểm tra Metadata & Cấu trúc ZIP**:
   - Sau khi stream hoàn tất, bắt buộc gọi hàm kiểm tra tính toàn vẹn (`oszMetadata.ts`).
   - Kiểm tra magic header file ZIP (`PK\x03\x04`), đọc cấu trúc mục lục tệp `.osu`.
   - Nếu file bị lỗi nén hoặc trang mirror trả về HTML lỗi (fake download), tệp tạm phải bị xoá lập tức và task được phân loại `transient` để thử lại mirror khác.
   - Chỉ đổi tên từ `.download` sang `.osz` khi file đã vượt qua bước kiểm tra toàn vẹn.

## 4. Bền Vững Hàng Đợi (Queue Persistence & Recovery)

1. **Checkpointing**:
   - Quá trình tải lưu snapshot định kỳ vào file `userData/download-queue.json` thông qua `queuePersistence.ts`.
   - Mọi thao tác ghi checkpoint phải dùng `atomicWriteFile`.
2. **Khởi động & Khôi phục**:
   - Khi khởi động ứng dụng, nếu phát hiện checkpoint còn dở dang từ lần tắt trước, hiển thị `DownloadRecoveryDialog.vue`.
   - Người dùng có thể chọn:
     - `resume`: Tiếp tục các beatmap chưa tải xong.
     - `discard`: Xóa file checkpoint sạch sẽ (`discardRecoveryState()`).
3. **Export Beatmap Tải Thất Bại**:
   - Cung cấp tính năng xuất các beatmapset bị lỗi tải (`download:export-failed-backup`) thành tệp `.bbak` mới để người dùng có thể thử lại vào thời điểm khác.
