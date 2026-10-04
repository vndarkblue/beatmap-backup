# AI Agent Guide & Rules Map — osu! Beatmap Backup

Toàn bộ quy chuẩn lập trình, kiến trúc kỹ thuật và hướng dẫn vận hành cho AI agents được tổ chức dạng module hóa bên trong thư mục [`.agents/`](file:///d:/coding/osu-beatmap-backup/.agents):

## 1. Quy Tắc Lập Trình (Rules) — Nạp theo phạm vi tệp

- [00-core.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/00-core.md): **(Luôn nạp)** Luật đỏ bất khả xâm phạm, bản đồ tài liệu, và Definition of Done.
- [architecture.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/architecture.md): Ma trận phân tầng module, hợp đồng khởi tạo Main process, quản lý state.
- [coding-style.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/coding-style.md): Prettier, TypeScript chuẩn mực, quy tắc đặt tên, tiêu chuẩn Vue SFC và icon.
- [main-ipc-preload.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/main-ipc-preload.md): Hợp đồng 4 điểm của IPC, đăng ký teardown và bảo vệ ContextBridge.
- [services.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/services.md): Mẫu Singleton, ghi log xoay vòng, worker thread, ghi đĩa an toàn.
- [renderer-vue.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/renderer-vue.md): Quy ước Vue 3, Composable quản lý state, chống memory leak và tối ưu hiệu năng.
- [security-paths.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/security-paths.md): Chốt chặn Shell, chống Path Traversal, mã hóa token nhạy cảm.
- [downloads-mirrors.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/downloads-mirrors.md): Giới hạn tốc độ (rate limit) của 5 mirror, kiểm tra toàn vẹn file ZIP `.osz`.
- [osu-data-access.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/osu-data-access.md): Kiểm tra tiến trình game trước khi đọc/ghi, parse `osu!.db`, Realm Lazer và SQLite.
- [i18n.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/i18n.md): Quy tắc tam giác ngôn ngữ (`en`, `vi`, `ja`), đồng bộ 100% placeholder.
- [workflow-tests.md](file:///d:/coding/osu-beatmap-backup/.agents/rules/workflow-tests.md): Quy trình kiểm thử, ngưỡng coverage cứng, xử lý ABI mismatch.

## 2. Ngữ Cảnh Chuyên Sâu (Context) — Đọc theo nhu cầu

- [overview.md](file:///d:/coding/osu-beatmap-backup/.agents/context/overview.md): Bức tranh tổng thể, vấn đề dự án giải quyết và triết lý thiết kế.
- [directory-map.md](file:///d:/coding/osu-beatmap-backup/.agents/context/directory-map.md): Bản đồ phân rã chi tiết trách nhiệm của từng file và thư mục.
- [data-flow.md](file:///d:/coding/osu-beatmap-backup/.agents/context/data-flow.md): Luồng dữ liệu các quy trình (Backup, Download, Sync, Filter) và bảng tra cứu IPC.
- [domain-glossary.md](file:///d:/coding/osu-beatmap-backup/.agents/context/domain-glossary.md): Thuật ngữ osu! (Beatmap vs Beatmapset, .osz, MD5 hash, Collection, Stable vs Lazer).
- [known-gaps.md](file:///d:/coding/osu-beatmap-backup/.agents/context/known-gaps.md): Các điểm lệch pha với tài liệu cũ, mã tàn dư và cạm bẫy kỹ thuật.

## 3. Kỹ Năng Quy Trình (Skills) — Runbooks

- [`add-ipc-endpoint`](file:///d:/coding/osu-beatmap-backup/.agents/skills/add-ipc-endpoint/SKILL.md): Quy trình 6 bước thêm kênh IPC end-to-end có kiểu dữ liệu an toàn.
- [`add-i18n-text`](file:///d:/coding/osu-beatmap-backup/.agents/skills/add-i18n-text/SKILL.md): Quy trình 4 bước thêm hoặc cập nhật chuỗi dịch cho cả 3 ngôn ngữ.
