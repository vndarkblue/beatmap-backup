<h1 align="center">
<a href="https://github.com/vndarkblue/beatmap-backup">
<img src="src/renderer/src/assets/logo.png" alt="Logo" width="256" height="256">
</a>

Beatmap Backup

</h1>

<div align="center">

[![Release](https://img.shields.io/github/v/release/vndarkblue/beatmap-backup)](https://github.com/vndarkblue/beatmap-backup/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](#)
[![electron](https://img.shields.io/badge/Electron-2B2E3A?logo=electron&logoColor=fff)](https://github.com/electron/electron)
[![typescript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://github.com/microsoft/TypeScript)
[![vue](https://img.shields.io/badge/Vue.js-4FC08D?logo=vuedotjs&logoColor=fff)](https://github.com/vuejs/)
[![Vuetify](https://img.shields.io/badge/Vuetify-1867C0?logo=vuetify&logoColor=fff)](https://github.com/vuetifyjs/vuetify)

<p align="center">
  <a href="README.md">English</a> •
  <b>Tiếng Việt</b> •
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#quick-start"><b>Cài đặt</b></a> •
  <a href="#screenshots">Ảnh chụp màn hình</a> •
  <a href="#development-setup">Thiết lập môi trường</a> •
  <a href="#contributing">Đóng góp</a>
</p>

</div>

## ℹ️ Giới thiệu <a id="about"></a>

Ứng dụng desktop cho người chơi osu! để sao lưu và chia sẻ bộ sưu tập beatmap. Thay vì sao chép hàng trăm gigabyte file beatmap, Beatmap Backup lưu lại danh sách ID của các bộ beatmap (beatmapset) — thường chỉ vài trăm kilobyte — và tự động tải lại chúng từ các máy chủ mirror công khai khi bạn cần khôi phục.

Các trường hợp sử dụng tiêu biểu:

- Cài lại Windows, chuyển sang máy tính mới hoặc khôi phục sau khi hỏng ổ cứng
- Chia sẻ toàn bộ bộ sưu tập beatmap cho bạn bè chỉ với một file siêu nhỏ

## 🚀 Bắt đầu nhanh (Dành cho người dùng) <a id="quick-start"></a>

1. **Tải về:** Truy cập mục [Releases](https://github.com/vndarkblue/beatmap-backup/releases/latest) và tải phiên bản mới nhất (Bản cài đặt `.exe` hoặc Bản Portable `.zip` cho Windows, `.AppImage` hoặc `.deb` cho Linux).
2. **Khởi chạy:** Chạy ứng dụng đã cài đặt (hoặc giải nén và mở file chạy của bản portable).
3. **Kiểm tra đường dẫn osu!:** Trong mục **Settings**, kiểm tra xem thư mục osu! của bạn đã được nhận diện đúng hay chưa.
4. **Đồng bộ thư viện:** Đảm bảo osu! đang tắt, sau đó nhấn đồng bộ thư viện để lập chỉ mục beatmap.

## Yêu cầu hệ thống <a id="requirements"></a>

- Windows 10/11 hoặc Linux
- Đã cài đặt osu!stable và/hoặc osu!lazer
- **osu! phải được đóng khi ứng dụng đọc thư viện beatmap.** osu!stable khóa file `osu!.db` khi đang chạy, còn osu!lazer liên tục ghi dữ liệu vào `client.realm` trong quá trình chơi, điều này sẽ tạo ra dữ liệu không nhất quán. Ứng dụng sẽ tự động phát hiện nếu client đang mở để bỏ qua việc đồng bộ thay vì đọc dữ liệu lỗi. Việc tải xuống hoàn toàn không bị ảnh hưởng — bạn có thể tải beatmap khi osu! đang mở.

---

## ✨ Tính năng <a id="features"></a>

- **Backup** — Xuất thư viện beatmap thành một file `.bbak` gọn nhẹ
  - **Hỗ trợ cả 2 client** — Đọc dữ liệu từ osu!stable (`osu!.db`) và osu!lazer (`client.realm`)
  - **Lọc theo Collection** — Chỉ sao lưu các bộ sưu tập bạn chọn
  - **Beatmap local** — Xuất trực tiếp các beatmap không có ID online thành file `.osz`
- **Restore & Download** — Tải lại beatmap trực tiếp từ các mirror công khai
  - **Chuyển mirror thông minh** — Tự động luân chuyển và dự phòng giữa các mirror để tránh giới hạn tốc độ (rate limit)
  - **Quản lý hàng đợi tải** — Tạm dừng, tiếp tục giữa các phiên và thử lại các bài tải lỗi
  - **Tránh trùng lặp** — Bỏ qua các beatmap đã có sẵn trong thư viện stable hoặc lazer của bạn

## ❓ Cách hoạt động <a id="how-it-works"></a>

File sao lưu là một file văn bản thuần (`.bbak`): mỗi dòng chứa một ID beatmapset, kèm vài dòng chú thích ở đầu. Bạn có thể mở xem bằng bất kỳ trình soạn thảo văn bản nào.

```
# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: 2026-08-28T09:00:00.000Z
# Total beatmaps: 4213
# Source: Stable + Lazer

12345
67890
```

Khi khôi phục, ứng dụng đọc danh sách trên và tải từng beatmapset dưới dạng file `.osz` vào thư mục bạn chọn. **Beatmap Backup không tự ý nạp file vào osu! cho bạn** — bạn chỉ cần kéo thả file vào game hoặc mở file để osu! tự nạp.

## 🖼️ Ảnh chụp màn hình <a id="screenshots"></a>

### Settings

![Settings UI](doc/screenshots/settings.png)

### Backup

![Backup UI](doc/screenshots/backup.png)

### Download

![Download UI](doc/screenshots/download.png)

### Resume Download

![Resume Download UI](doc/screenshots/download_resume.png)

## 🛠️ Thiết lập môi trường phát triển (Dành cho cộng tác viên) <a id="development-setup"></a>

### Yêu cầu trước khi bắt đầu

- [Node.js](https://nodejs.org/) (v20 trở lên)
- [npm](https://www.npmjs.com/) (v10 trở lên)
- Đã cài đặt [osu!](https://osu.ppy.sh/) (stable và/hoặc lazer)

Các native module (`better-sqlite3`, `realm`) sẽ được biên dịch lại cho Electron khi cài đặt, do đó cần có C++ toolchain: Visual Studio Build Tools trên Windows, hoặc `build-essential` và `python3` trên Linux.

### Biên dịch từ mã nguồn (Clone & Chạy cục bộ)

1. Clone repository:

```bash
git clone https://github.com/vndarkblue/beatmap-backup.git
cd beatmap-backup
npm install
npm run dev
```

### Các lệnh có sẵn

```bash
npm run dev          # Khởi chạy development server
npm run build        # Type-check, sau đó build cho bản phát hành
npm run build:win    # Build cho Windows
npm run build:linux  # Build cho Linux
npm test             # Chạy bộ test vitest
npm run lint         # Chạy ESLint
npm run typecheck    # Type-check main, preload, và renderer
```

### Cấu trúc dự án

```
beatmap-backup/
├── src/
│   ├── main/                # Electron main process, vòng đời cửa sổ, IPC routing
│   ├── preload/             # Context bridge và các API giao tiếp renderer
│   ├── renderer/            # Ứng dụng Vue 3
│   │   └── src/
│   │       ├── assets/      # CSS toàn cục và tài nguyên tĩnh
│   │       ├── components/  # Vue components (Settings, Backup, Download, layout)
│   │       ├── composables/ # Các composable Vue tái sử dụng
│   │       ├── i18n/        # Bản dịch đa ngôn ngữ
│   │       └── router/      # Cấu hình Vue Router
│   ├── services/            # Logic nghiệp vụ ứng dụng (main process)
│   │   ├── collection/      # Đọc collection từ osu!stable và lazer
│   │   ├── database/        # SQLite schema, bộ import, quản lý đồng bộ
│   │   └── download/        # Quản lý hàng đợi tải, mirror & bộ điều phối
│   ├── config/              # Các hằng số chia sẻ, cấu hình mirror
│   └── utils/               # Các hàm tiện ích dùng chung
└── tests/                   # Bộ test Vitest
```

## 🤝 Đóng góp <a id="contributing"></a>

Mọi đóng góp đều luôn được hoan nghênh!

Để biết thêm hướng dẫn chi tiết, vui lòng xem [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 🙏 Cảm ơn

Ứng dụng sử dụng API từ các beatmap mirror công khai. Xin chân thành cảm ơn các dự án và người duy trì máy chủ:

- [osu.direct](https://osu.direct/)
- [NeriNyan](https://nerinyan.moe/)
- [Mino (former chimu.moe)](https://catboy.best/)
- [Nekoha](https://mirror.nekoha.moe/)
- [BeatConnect](https://beatconnect.io/)

Để giảm tải cho các máy chủ mirror, ứng dụng mặc định áp dụng cơ chế tải cẩn trọng:

- Kiểm tra tình trạng hoạt động của mirror trước khi gửi yêu cầu
- Phân bổ lưu lượng tải qua nhiều mirror thay vì liên tục dồn yêu cầu vào một endpoint duy nhất
- Tự động thử lại/chuyển sang mirror khác khi một máy chủ phản hồi chậm hoặc tạm thời gián đoạn
- Tối ưu luồng tải để tránh các cuộc gọi API lặp lại không cần thiết

Nếu bạn là người vận hành một trong các mirror trên và nhận thấy lưu lượng truy cập bất thường, vui lòng mở issue để chúng tôi kịp thời điều chỉnh.

## ❗ Tuyên bố miễn trừ trách nhiệm

Đây là một công cụ không chính thức và không liên kết hay được chứng thực bởi osu! hoặc ppy Pty Ltd.

## 📄 Giấy phép

Dự án được phân phối dưới giấy phép MIT License — xem [LICENSE](LICENSE) để biết chi tiết.
