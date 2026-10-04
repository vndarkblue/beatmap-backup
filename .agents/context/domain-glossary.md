# Domain Glossary: osu! Concepts & Terminology

Giải thích chi tiết các thuật ngữ đặc thù của hệ sinh thái game **osu!** và cách chúng được mô hình hóa trong codebase **Beatmap Backup**.

---

## 1. Beatmap và Beatmapset (Sự Khác Biệt Cốt Lõi)

| Khái niệm                     | Định dạng        | Định danh               | Ý nghĩa kỹ thuật                                                                                                                                      |
| :---------------------------- | :--------------- | :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beatmap (Difficulty)**      | Tệp `.osu`       | `beatmapId`, `MD5 hash` | Một độ khó cụ thể của một bài nhạc (ví dụ: Easy, Hard, Insane). Chứa vị trí các nốt nhạc (hit objects), timing, và thiết lập độ khó (CS, AR, OD, HP). |
| **BeatmapSet (Song Package)** | Tệp `.osz` (ZIP) | `beatmapsetId`          | Toàn bộ gói bài hát, bao gồm tất cả các độ khó (các tệp `.osu`), tệp âm thanh (`audio.mp3`), ảnh nền (`bg.jpg`), video và storyboard.                 |

> [!IMPORTANT]
> Toàn bộ quy trình Sao lưu (`.bbak`), Tải xuống (Download) và Khôi phục của ứng dụng này đều hoạt động ở cấp độ **BeatmapSet** (`beatmapsetId`). Khi người dùng tải một bài hát, ứng dụng tải trọn vẹn tệp `.osz` chứa mọi độ khó của bài đó.

---

## 2. Định Dạng Tệp & Lưu Trữ

### Tệp `.bbak` (Beatmap Backup File)

- **Bản chất**: Tệp văn bản thuần (Plaintext UTF-8) siêu nhẹ do ứng dụng tạo ra.
- **Cấu trúc**:
  ```text
  # osu! beatmap backup file
  # Exported: 2026-10-04T01:00:00.000Z
  # Total Beatmapsets: 3
  # Filter: Mode=osu, MinStars=5.0
  123456
  789012
  345678
  ```
- **Ưu điểm**: Danh sách 50.000 bài hát chỉ tốn chưa đầy 500 KB dung lượng, có thể lưu trữ trên đám mây hoặc gửi qua email cực kỳ nhanh chóng.

### Tệp `.osz`

- **Bản chất**: Bản chất là một tệp nén định dạng standard ZIP (`PK\x03\x04`), đổi phần mở rộng thành `.osz`.
- Khi người dùng nhấp đúp vào tệp `.osz`, game osu! sẽ tự động giải nén và nhập bài hát vào thư viện game.

### No-Video Download (`?noVideo`)

- Tùy chọn tải gói `.osz` đã được máy chủ mirror loại bỏ tệp video (`.mp4`, `.flv`, `.avi`).
- Giúp giảm từ 50% đến 80% dung lượng tải và tiết kiệm tài nguyên đĩa cứng cho người chơi không có nhu cầu xem video nền.

---

## 3. Hệ Thống Bộ Sưu Tập (Collections) & Bài Toán MD5 Hash

- **Trong osu!**: Người chơi phân loại bài hát vào các danh sách tùy biến gọi là Collection (ví dụ: "Warmup", "Stream 200BPM", "Favorites").
- **Độ lệch dữ liệu**:
  - File `collection.db` của osu!stable lưu bài hát bằng chuỗi **MD5 hash** của từng file độ khó `.osu` đơn lẻ, **không lưu `beatmapsetId`**.
  - Các máy chủ mirror công cộng chỉ nhận tải theo `beatmapsetId`.
- **Giải pháp của Beatmap Backup**:
  - Ứng dụng duy trì chỉ mục (Index) ánh xạ giữa `MD5 Hash ↔ beatmapsetId` trong cơ sở dữ liệu SQLite cục bộ (`beatmaps.db`).
  - Nếu gặp bài hát mới chưa có trong DB, ứng dụng sử dụng `osuDirectService.ts` để truy vấn ngược từ API osu!direct nhằm lấy `beatmapsetId` chuẩn xác.

---

## 4. osu!stable vs osu!lazer (Hai Kiến Trúc Khác Biệt)

### osu!stable (Phiên bản truyền thống)

- **Tệp cơ sở dữ liệu**: `osu!.db` (Danh mục beatmaps) và `collection.db` (Bộ sưu tập). Cả hai đều là định dạng nhị phân độc quyền (Binary stream với các kiểu dữ liệu byte, short, int, long, double, string UTF-8 tiền tố 0x0b).
- **Thư mục bài hát**: Lưu trữ tại `Songs/` theo thư mục dạng `{beatmapsetId} {Artist} - {Title}`.
- **Tiến trình**: `osu!.exe`.

### osu!lazer (Phiên bản thế hệ mới)

- **Tệp cơ sở dữ liệu**: `client.realm` (Cơ sở dữ liệu NoSQL Realm của MongoDB).
- **Lưu trữ tệp (Sharded Files)**: Không lưu theo thư mục tên bài hát. Mọi tệp thành phần (âm thanh, ảnh, `.osu`) được băm SHA-256 và lưu rải rác trong `files/ab/abcdef123456...`.
- **Tiến trình**: `osu.exe` (hoặc `osu!` trên macOS/Linux).

---

## 5. Chế Độ Chạy Di Động (Portable Mode)

- Ứng dụng cung cấp gói build Portable độc lập cho Windows.
- Khi tệp thực thi nằm trong môi trường portable, toàn bộ dữ liệu cấu hình, cơ sở dữ liệu SQLite (`beatmaps.db`) và nhật ký log (`logs/`) được chuyển hướng vào thư mục con `data/` ngay cạnh tệp thực thi thay vì lưu vào `%APPDATA%`.
- Giúp người dùng có thể copy toàn bộ phần mềm vào ổ cứng di động / USB mang sang máy khác sử dụng mà không để lại rác hệ thống.
