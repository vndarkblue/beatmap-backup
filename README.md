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

</div>

## ℹ️ About

A desktop application that helps osu! players back up and share their beatmapsets. Built with Electron, Vue 3, and TypeScript.

## ✨ Features

- **Create backups** — Export a list of your installed beatmapset IDs to a backup file
- **Download** — Load a backup file and download beatmaps from multiple mirror sources
- **Multi-language support** (English & Vietnamese for now)
- **Modern, intuitive UI**
- **Supports both osu! stable and osu!lazer**

## 🖥️ Platform Support

| Platform      | Status                                                 |
| ------------- | ------------------------------------------------------ |
| Windows 10/11 | ✅ Tested                                              |
| Linux         | ⚠️ Builds available (AppImage, deb, snap) — not tested |

## 🖼️ Screenshots

_Coming soon_

## 🚀 Quick Start (For Users)

1. Go to the [Releases](https://github.com/vndarkblue/beatmap-backup/releases) page
2. Download the latest installer for your operating system, install and launch **Beatmap Backup**.
3. If you do not want to install, you can also download and extract the zip file, then run `beatmap-backup.exe`.
3. Make sure **osu!** (stable or lazer) is installed on your system

## 🛠️ Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) (v8 or higher)
- [osu!](https://osu.ppy.sh/) installed (stable and/or lazer)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/vndarkblue/beatmap-backup.git
cd beatmap-backup
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:linux  # Linux

# Run linter
npm run lint

# Run type checking
npm run typecheck
```

### Project Structure

```
beatmap-backup/
├── src/
│   ├── main/               # Electron main process
│   ├── preload/            # Preload scripts (context bridge)
│   ├── renderer/           # Vue application
│   │   └── src/
│   │       ├── assets/     # Global CSS and static assets
│   │       ├── components/ # Vue components
│   │       ├── composables/# Reusable Vue composables
│   │       ├── i18n/       # Translations
│   │       └── router/     # Vue router config
│   ├── services/           # Backend logic
│   │   └── download/       # Download service modules
│   └── config/             # Shared constants and configuration
├── resources/              # Static resources
└── build/                  # Build configuration (electron-builder)
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

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

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.
