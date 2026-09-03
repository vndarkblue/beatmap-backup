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
  <a href="#quick-start"><b>Install</b></a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#development-setup">Development Setup</a> •
  <a href="#contributing">Contributing</a>
</p>

</div>

## ℹ️ About <a id="about"></a>

A desktop app for osu! players to back up and share their beatmap collection. Instead of copying hundreds of gigabytes of beatmap files, Beatmap Backup saves a list of your beatmapset IDs — usually a few hundred kilobytes — and re-downloads the beatmaps from public mirrors when you restore.

Typical uses:

- Reinstalling Windows, moving to a new machine, or recovering from a dead drive
- Sending your collection to a friend as one small file

## 🚀 Quick Start (For Users) <a id="quick-start"></a>

1. **Download:** Head over to [Releases](https://github.com/vndarkblue/beatmap-backup/releases/latest) and download the installer (`.exe` for Windows, `.AppImage` or `.deb` for Linux).
2. **Install & Launch:** Run the installer and open **Beatmap Backup**.
3. **Verify osu! Path:** In **Settings**, check that your osu! folder was detected correctly.
4. **Sync Library:** Ensure osu! is closed, then run a library sync to index your beatmaps.

## Requirements <a id="requirements"></a>

- Windows 10/11 or Linux
- osu!stable and/or osu!lazer installed
- **osu! must be closed when the app reads your beatmap library.** osu!stable locks `osu!.db` while running, and osu!lazer writes to `client.realm` continuously during play, which would produce an inconsistent snapshot. The app detects a running client and skips the sync instead of reading bad data. Downloading is unaffected - you can restore while osu! is open.

---

## ✨ Features <a id="features"></a>

- **Backup** - Export the beatmapset IDs of your installed beatmaps to a file
- **Restore** - Load a backup file and download the beatmaps from mirror sites
- **Resume** - An interrupted download queue can be continued in a later session
- **Both clients** - Reads osu!stable (`osu!.db`) and osu!lazer (`client.realm`)
- **Collection filter** - Narrow a backup down to specific collections
- **Local beatmaps** - Beatmapsets with no online ID are exported as `.osz` files, since those cannot be re-downloaded from anywhere

## ❓How it works <a id="how-it-works"></a>

A backup file is a plain text file: one beatmapset ID per line, with a few comment lines at the top. You can open it in any text editor.

```
# Beatmap Backup File
# Format: One beatmapset ID per line
# Created: 2026-08-28T09:00:00.000Z
# Total beatmaps: 4213
# Source: Stable + Lazer

12345
67890
```

Restoring reads that list and downloads each beatmapset as an `.osz` file into a folder you choose. **Beatmap Backup does not import the files into osu! for you** - you drag them into the game yourself.

## 🖥️ Platform Support <a id="platform-support"></a>

| Platform      | Status                                                 |
| ------------- | ------------------------------------------------------ |
| Windows 10/11 | ✅ Tested                                              |
| Linux         | ⚠️ Builds available (AppImage, deb, snap) — not tested |

## 🖼️ Screenshots <a id="screenshots"></a>

### Settings

![Settings UI](doc/screenshots/settings.png)

### Backup

![Backup UI](doc/screenshots/backup.png)

### Download

![Download UI](doc/screenshots/download_1.png)

### Download Queue

![Download Queue UI](doc/screenshots/download_2.png)

### Resume Download

![Resume Download UI](doc/screenshots/download_resume.png)

## 🛠️ Development Setup (Contributors) <a id="development-setup"></a>

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher)
- [npm](https://www.npmjs.com/) (v10 or higher)
- [osu!](https://osu.ppy.sh/) installed (stable and/or lazer)

Native modules (`better-sqlite3`, `realm`) are rebuilt for Electron on install, so a C++ toolchain is required: Visual Studio Build Tools on Windows, or `build-essential` and `python3` on Linux.

### Building from Source (Clone & Run Locally)

1. Clone the repository:

```bash
git clone https://github.com/vndarkblue/beatmap-backup.git
cd beatmap-backup
npm install
npm run dev
```

### Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Type-check, then build for production
npm run build:win    # Build for Windows
npm run build:linux  # Build for Linux
npm test             # Run the vitest suite
npm run lint         # Run ESLint
npm run typecheck    # Type-check main, preload, and renderer
```

### Project Structure

```
beatmap-backup/
├── src/
│   ├── main/                # Electron main process, window lifecycle, IPC routing
│   ├── preload/             # Context bridge and the exposed API surface
│   ├── renderer/            # Vue 3 application
│   │   └── src/
│   │       ├── assets/      # Global CSS and static assets
│   │       ├── components/  # Vue components (Settings, Backup, Download)
│   │       ├── composables/ # Reusable Vue composables
│   │       ├── i18n/        # Translations
│   │       └── router/      # Vue Router config
│   ├── services/            # Application logic (main process)
│   │   ├── collection/      # collection.db and lazer collection reading
│   │   ├── database/        # SQLite schema, importers, sync manager
│   │   └── download/        # Download queue internals
│   ├── config/              # Shared constants, mirror definitions
│   └── utils/               # Small shared helpers
└── tests/                   # Vitest suite
```

## 🤝 Contributing <a id="contributing"></a>

Contributions are welcome!

For detailed guidelines, see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 🙏 Credits

This app uses public beatmap mirror APIs. Big thanks to these projects and maintainers:

- [osu.direct](https://osu.direct/)
- [NeriNyan](https://nerinyan.moe/)
- [Mino (former chimu.moe)](https://catboy.best/)
- [Nekoha](https://mirror.nekoha.moe/)
- [BeatConnect](https://beatconnect.io/)

To reduce pressure on beatmap mirrors, download behavior is conservative by default:

- Mirror health is checked before use
- Requests are distributed across multiple mirrors instead of targeting a single endpoint continuously
- Retry/fallback logic switches to other mirrors when a mirror is slow or temporarily down
- Download flow avoids unnecessary repeated API calls for the same task

If you run one of the beatmap mirrors above and notice any problematic traffic pattern, please open an issue so we can adjust quickly.

## ❗ Disclaimer

This is an unofficial tool and is not affiliated with or endorsed by osu! or ppy Pty Ltd.

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
