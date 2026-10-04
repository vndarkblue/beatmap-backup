# Directory Map: osu! Beatmap Backup

Bản đồ cấu trúc chi tiết toàn bộ thư mục và trách nhiệm của từng tệp trong repository.

```
osu-beatmap-backup/
├── .agents/                        # Chỉ dẫn, quy tắc và kỹ năng cho AI agents
│   ├── rules/                      # Các file quy ước lập trình (tự nạp theo glob)
│   ├── context/                    # Tài liệu ngữ cảnh sâu về hệ thống
│   └── skills/                     # Quy trình thao tác chuẩn (runbooks)
├── scripts/                        # Các script tiện ích hỗ trợ bảo trì dự án
│   ├── i18n-export-csv.js          # Xuất từ điển JSON sang bảng tính CSV
│   ├── i18n-import-csv.js          # Nhập từ bảng tính CSV trở lại JSON
│   └── test-compare-databases.js   # Script chẩn đoán kiểm tra độ lệch schema DB
├── src/
│   ├── config/                     # Hằng số và cấu hình dùng chung giữa các tầng
│   │   ├── appConstants.ts         # Hằng số tầng Main & App (kích thước cửa sổ, app ID)
│   │   ├── beatmapMirrors.ts       # Danh sách cấu hình 5 mirror tải beatmap và headers
│   │   └── frontendConstants.ts    # Hằng số tầng Renderer (Storage keys, thời gian timing UI)
│   ├── main/                       # Tiến trình Main (Node.js/Electron)
│   │   ├── backgroundServices.ts   # Vòng đời tác vụ chạy nền (DB sync, updater, process watcher)
│   │   ├── index.ts                # Điểm vào chính của ứng dụng (window setup, lifecycle)
│   │   ├── initPortable.ts         # Khởi tạo chế độ portable (dòng đầu tiên của index.ts)
│   │   ├── pathGuards.ts           # Chốt chặn bảo mật Shell, Path Traversal, URL validation
│   │   ├── portable.ts             # Logic phát hiện và chuyển hướng thư mục userData cho portable
│   │   ├── windowState.ts          # Lưu và khôi phục kích thước, vị trí cửa sổ
│   │   └── ipc/                    # Đăng ký các kênh IPC Main-side theo domain
│   │       ├── backupIpc.ts        # Kênh IPC cho preview, ước tính và export backup
│   │       ├── databaseIpc.ts      # Kênh IPC cho sync database, trạng thái collection, tìm kiếm
│   │       ├── downloadIpc.ts      # Kênh IPC cho engine tải xuống, kiểm soát hàng đợi, recovery
│   │       ├── registerIpcHandlers.ts # Gộp toàn bộ đăng ký IPC và quản lý teardown
│   │       ├── settingsIpc.ts      # Kênh IPC cho cấu hình ứng dụng và Beatconnect token
│   │       ├── systemIpc.ts        # Kênh IPC cho thao tác hệ thống (chọn file, mở folder, log)
│   │       └── updaterIpc.ts       # Kênh IPC cho tự động kiểm tra và cài đặt bản cập nhật
│   ├── preload/                    # Cầu nối an toàn ContextBridge (Preload script)
│   │   ├── electronApiTypes.ts     # Nguồn sự thật duy nhất về kiểu dữ liệu IPC Main ↔ Renderer
│   │   ├── index.d.ts              # Định nghĩa toàn cục window.electronAPI cho TypeScript
│   │   └── index.ts                # Phơi bày window.electronAPI có kiểu chặt chẽ vào renderer
│   ├── services/                   # Nghiệp vụ cốt lõi (chạy trên Main Process)
│   │   ├── backupNaming.ts         # Tạo tên tệp backup chuẩn hóa theo thời gian và bộ lọc
│   │   ├── beatmapMirrorService.ts # Giám sát trạng thái hoạt động (health check) của các mirror
│   │   ├── downloadService.ts      # Engine tải beatmap đa luồng, smart rate limit, event dispatcher
│   │   ├── exportService.ts        # Logic trích xuất danh sách beatmap và ghi tệp .bbak
│   │   ├── localBeatmapExport.ts   # Tạo tệp .osz từ các tệp thô trong thư mục osu! hoặc Lazer files
│   │   ├── logger.ts               # Ghi log xoay vòng (app.log/app.old.log), ring-buffer, crash dump
│   │   ├── pathAutoDetect.ts       # Tự động quét tìm đường dẫn cài đặt osu!stable và osu!lazer
│   │   ├── processDetector.ts      # Quét tiến trình đang chạy để phát hiện game osu! (Windows/Linux/Mac)
│   │   ├── realmService.ts         # Mở và truy vấn cơ sở dữ liệu client.realm của osu!lazer (Read-only)
│   │   ├── settingsStore.ts        # Quản lý electron-store và mã hóa token qua safeStorage
│   │   ├── startupAutoDetect.ts    # Tự động phát hiện môi trường game khi khởi động lần đầu
│   │   ├── updateService.ts        # Kiểm tra bản cập nhật mới từ GitHub Releases qua electron-updater
│   │   ├── collection/             # Xử lý bộ sưu tập bài hát (Collections)
│   │   │   ├── collectionService.ts     # Phân tích collection và ghép metadata beatmapset
│   │   │   ├── collectionSyncService.ts # Đồng bộ collection giữa stable, lazer và SQLite
│   │   │   ├── osuDirectService.ts      # Tìm kiếm bổ sung beatmapset ID từ osu!direct API
│   │   │   ├── stableCollectionParser.ts # Parse định dạng nhị phân collection.db của osu!stable
│   │   │   └── types.ts                 # Kiểu dữ liệu về collection, merge mode, stats
│   │   ├── database/               # Quản lý cơ sở dữ liệu SQLite cục bộ (beatmaps.db)
│   │   │   ├── beatmapFilterQuery.ts    # Xây dựng câu truy vấn SQL tìm kiếm beatmap động
│   │   │   ├── databaseService.ts       # Quản lý kết nối SQLite, migrations, CRUD beatmaps
│   │   │   ├── lazerImporter.ts         # Đồng bộ beatmaps từ client.realm vào SQLite
│   │   │   ├── schema.ts                # Schema DDL và cấu trúc bảng beatmaps/beatmapsets
│   │   │   ├── stableDbParserUtils.ts   # Tiện ích chuyển đổi dữ liệu từ raw osu!.db sang schema chuẩn
│   │   │   ├── stableImporter.ts        # Khởi chạy worker thread để đồng bộ osu!.db
│   │   │   ├── syncManager.ts           # Điều phối toàn bộ quá trình đồng bộ định kỳ/khởi động
│   │   │   └── types.ts                 # Định nghĩa kiểu dữ liệu database và sự kiện đồng bộ
│   │   ├── download/               # Các module phụ trợ cho engine tải
│   │   │   ├── downloadTargetValidator.ts # Kiểm tra dung lượng đĩa và tính hợp lệ của thư mục tải
│   │   │   ├── httpDownloader.ts        # Tải stream HTTP/HTTPS với cơ chế retry và pipeline
│   │   │   ├── oszMetadata.ts           # Kiểm tra cấu trúc ZIP và đọc thông tin .osz tải về
│   │   │   ├── queuePersistence.ts      # Lưu và khôi phục snapshot hàng đợi tải dở dang
│   │   │   └── types.ts                 # Kiểu dữ liệu tác vụ tải (DownloadTask, DownloadOptions)
│   │   ├── types/                  # Kiểu dữ liệu chia sẻ của services
│   │   │   └── beatmapset.ts       # Định nghĩa đối tượng Beatmapset
│   │   └── workers/                # Luồng Worker Threads cho tác vụ nặng
│   │       └── stableImportWorker.ts # Worker thread chuyên phân tích nhị phân file osu!.db lớn
│   ├── utils/                      # Tiện ích đa môi trường (không phụ thuộc tầng trên)
│   │   ├── beatmapTitle.ts         # Parse tên bài hát, nghệ sĩ từ tên file .osz
│   │   ├── env.ts                  # Tiện ích phát hiện môi trường dev/production
│   │   └── fileUtils.ts            # Ghi file nguyên tử (atomicWriteFile)
│   └── renderer/                   # Giao diện người dùng (Chromium / Vue 3)
│       ├── index.html              # HTML shell (chứa loading skeleton ban đầu)
│       └── src/
│           ├── App.vue             # Root component (chứa Layout chính, Titlebar, Sidebar, Router view)
│           ├── env.d.ts            # Khai báo môi trường client Vite
│           ├── main.ts             # Khởi tạo Vue app, Vuetify, Icon aliases, Vue I18n, Error hooks
│           ├── router.ts           # Cấu hình Vue Router (WebHashHistory)
│           ├── assets/             # Tài nguyên tĩnh
│           │   ├── main.css        # CSS toàn cục, CSS tokens, tùy biến Vuetify & SimpleBar
│           │   └── fonts/          # Font Torus Notched nội bộ
│           ├── components/         # Các View chính và component thành phần
│           │   ├── Backup.vue      # Màn hình Sao lưu Beatmap
│           │   ├── BeatmapFilter.vue # Màn hình Lọc và Tìm kiếm Beatmap
│           │   ├── Download.vue    # Màn hình Quản lý Tải xuống & Hàng đợi
│           │   ├── Settings.vue    # Màn hình Cài đặt Ứng dụng
│           │   ├── backup/         # Card con của màn hình Backup
│           │   │   ├── BackupActionCard.vue      # Nút bấm hành động và thanh tiến độ
│           │   │   ├── BackupCollectionsCard.vue # Danh sách chọn bộ sưu tập để backup
│           │   │   └── BackupSourcesCard.vue     # Chọn nguồn (Stable, Lazer, All)
│           │   ├── common/         # Component dùng chung
│           │   │   ├── AppForm.vue               # Khung form chuẩn
│           │   │   ├── AppIsland.vue             # Khung thẻ nền bo tròn có hiệu ứng kính
│           │   │   ├── AppViewShell.vue          # Khung trang chuẩn có tiêu đề và mô tả
│           │   │   └── PathField.vue             # Ô nhập đường dẫn kèm nút duyệt file/thư mục
│           │   ├── download/       # Card con của màn hình Download
│           │   │   ├── DownloadActiveTable.vue   # Bảng hiển thị danh sách bài đang tải/hoàn tất
│           │   │   ├── DownloadQueueOverview.vue # Thống kê tiến độ hàng đợi, tốc độ, nút điều khiển
│           │   │   ├── DownloadRecoveryDialog.vue# Hộp thoại khôi phục hàng đợi khi mở lại app
│           │   │   └── DownloadSetupCard.vue     # Khởi tạo tác vụ tải mới từ file .bbak
│           │   ├── filter/         # Card con của màn hình Lọc
│           │   │   ├── FilterCriteriaCard.vue    # Các tiêu chí lọc (Chế độ chơi, Star, BPM, Rank)
│           │   │   ├── FilterResultsCard.vue     # Danh sách kết quả và nút xuất backup
│           │   │   └── types.ts                  # Kiểu dữ liệu filter tiêu chí
│           │   ├── layout/         # Thành phần bố cục cố định
│           │   │   ├── AppSidebar.vue            # Thanh điều hướng bên trái
│           │   │   └── AppTitlebar.vue           # Thanh tiêu đề frameless (kèm nút min/max/close)
│           │   └── settings/       # Card con của màn hình Settings
│           │       ├── SettingsAboutCard.vue     # Thông tin phiên bản, bản quyền, liên kết
│           │       ├── SettingsDatabaseCard.vue  # Quản lý đồng bộ database và collection
│           │       ├── SettingsDiagnosticCard.vue# Xem log, xuất chẩn đoán lỗi
│           │       ├── SettingsDownloadCard.vue  # Cấu hình luồng tải, mirror, Beatconnect token
│           │       ├── SettingsPathsCard.vue     # Cấu hình đường dẫn osu!stable, lazer, Songs
│           │       └── SettingsResetCard.vue     # Khôi phục cài đặt gốc
│           ├── composables/        # Quản lý logic nghiệp vụ và state phản ứng phía UI
│           │   ├── useBackupWorkflow.ts   # Luồng chuẩn bị, ước tính và xuất backup
│           │   ├── useDownloadQueue.ts    # Luồng quản lý hàng đợi tải, flush buffer, phục hồi
│           │   ├── useDownloadSettings.ts # Cài đặt tải xuống và lưu trữ cấu hình
│           │   └── useUpdater.ts          # Luồng thông báo và cập nhật phiên bản mới
│           ├── i18n/               # Hệ thống đa ngôn ngữ
│           │   ├── index.ts        # Cấu hình Vue I18n
│           │   └── locales/        # Từ điển ngôn ngữ (en.json, vi.json, ja.json)
│           └── utils/              # Tiện ích phía renderer
│               └── databaseStatus.ts      # Format trạng thái đồng bộ cơ sở dữ liệu
├── tests/                          # Toàn bộ test suite Vitest (phản chiếu thư mục src/)
│   ├── config/                     # Test hằng số và danh sách mirror
│   ├── main/                       # Test lưu/khôi phục kích thước cửa sổ
│   ├── renderer/                   # Test tính nhất quán i18n và tiện ích hiển thị
│   └── services/                   # Test nghiệp vụ cốt lõi, pathGuards, database, downloader
├── package.json                    # Cấu hình dự án, dependencies và npm scripts
├── electron.vite.config.ts         # Cấu hình build electron-vite cho main, preload, renderer
├── electron-builder.yml            # Cấu hình đóng gói installer & portable cho Windows/Linux/Mac
├── eslint.config.mjs               # Flat ESLint config (TypeScript, Vue, Prettier)
├── vitest.config.ts                # Cấu hình Vitest và ngưỡng coverage cứng
└── ARCHITECTURAL_DIGEST.md         # Bản đặc tả tóm tắt kỹ thuật gốc của codebase
```
