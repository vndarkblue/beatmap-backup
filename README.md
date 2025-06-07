<h1 align="center">
<a href="https://github.com/vndarkblue/beatmap-backup">
<img src="src/renderer/src/assets/logo.png" alt="Logo" width="256" height="256">
</a>

Beatmap Backup
</h1>

<div align="center">

[![electron](https://img.shields.io/badge/Electron-2B2E3A?logo=electron&logoColor=fff)](https://github.com/electron/electron)
[![typescript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://github.com/microsoft/TypeScript)
[![vue](https://img.shields.io/badge/Vue.js-4FC08D?logo=vuedotjs&logoColor=fff)](https://github.com/vuejs/)
[![Vuetify](https://img.shields.io/badge/Vuetify-1867C0?logo=vuetify&logoColor=fff)](https://github.com/vuetifyjs/vuetify)
</div>

## About
A desktop application that helps osu! players backup and share their beatmap sets. Built with Electron, Vue 3, and TypeScript.


## Features

- Create backup files containing beatmapset IDs
- Share backup files with other players
- Import backup files to download beatmaps
- Support for multiple languages
- Modern and intuitive user interface
- Cross-platform support (Windows, macOS, Linux)

## Screenshots

*Coming soon*

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) (v7 or higher)
- [osu!](https://osu.ppy.sh/) game installed. Both stable and lazer are suppported.

## Installation

### For Users

1. Download the latest release from the [Releases](https://github.com/vndarkblue/beatmap-backup/releases) page
2. Run the installer for your operating system
3. Launch the application

### For Developers

1. Clone the repository:
```bash
git clone https://github.com/yourusername/beatmap-backup.git
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

## Development

### Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# Run linter
npm run lint

# Run type checking
npm run typecheck
```

## Project Structure

```
osu-backup/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # Vue application
│   ├── preload/        # Preload scripts
│   ├── services/       # Back-end logic
│   └── config/         # Configuration files
├── resources/          # Static resources
└── build/             # Build configuration
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License
This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

