# Directory Map: osu! Beatmap Backup

Detailed architectural structure and responsibility map for every file and folder in the repository.

```
osu-beatmap-backup/
├── .agents/                        # AI agent guidelines, rules, and operational runbooks
│   ├── rules/                      # Coding convention rules (auto-loaded via glob)
│   ├── context/                    # In-depth architectural and operational context
│   └── skills/                     # Standard operational runbooks
├── scripts/                        # Maintenance and utility automation scripts
│   ├── i18n-export-csv.js          # Exports JSON translation dictionaries to CSV spreadsheet
│   ├── i18n-import-csv.js          # Imports translated CSV spreadsheets back into JSON files
│   └── test-compare-databases.js   # Diagnostic script checking DB schema parity
├── src/
│   ├── config/                     # Shared constants and configurations across process boundaries
│   │   ├── appConstants.ts         # Main process & app-level constants (window dimensions, app ID)
│   │   ├── beatmapMirrors.ts       # 5 download mirrors configuration and request headers
│   │   └── frontendConstants.ts    # Renderer constants (Storage keys, UI timing intervals)
│   ├── main/                       # Main Process (Node.js/Electron)
│   │   ├── backgroundServices.ts   # Lifecycle of background services (DB sync, updater, process watcher)
│   │   ├── index.ts                # Application entry point (window setup, lifecycle hooks)
│   │   ├── initPortable.ts         # Portable mode initialization (first line of index.ts)
│   │   ├── pathGuards.ts           # Security checkpoints for Shell calls, Path Traversal, URL validation
│   │   ├── portable.ts             # Detection and redirection of userData directory for portable mode
│   │   ├── windowState.ts          # Window position and dimension persistence
│   │   └── ipc/                    # Main-side IPC channel registration by domain
│   │       ├── backupIpc.ts        # IPC channels for backup preview, estimation, and export
│   │       ├── databaseIpc.ts      # IPC channels for database sync, collection status, beatmap search
│   │       ├── downloadIpc.ts      # IPC channels for download engine, queue management, recovery
│   │       ├── registerIpcHandlers.ts # Aggregates all IPC registrations and manages teardowns
│   │       ├── settingsIpc.ts      # IPC channels for application settings and Beatconnect token
│   │       ├── systemIpc.ts        # IPC channels for system dialogs, file revealing, logs
│   │       └── updaterIpc.ts       # IPC channels for update checks and installation
│   ├── preload/                    # Safe ContextBridge bridge layer (Preload script)
│   │   ├── electronApiTypes.ts     # Single source of truth for IPC types between Main and Renderer
│   │   ├── index.d.ts              # Global TypeScript declaration for window.electronAPI
│   │   └── index.ts                # Exposes typed window.electronAPI into renderer
│   ├── services/                   # Core business logic (Runs in Main Process)
│   │   ├── backupNaming.ts         # Generates standardized backup file names with timestamps and filters
│   │   ├── beatmapMirrorService.ts # Monitors operational health checks of download mirrors
│   │   ├── downloadService.ts      # Multi-threaded download engine, smart rate limiting, event dispatcher
│   │   ├── exportService.ts        # Beatmap list extraction and .bbak file generation
│   │   ├── localBeatmapExport.ts   # Packages raw beatmap files from disk or Lazer into .osz archives
│   │   ├── logger.ts               # Rotating file logger (app.log/app.old.log), ring-buffer, crash dumps
│   │   ├── pathAutoDetect.ts       # Auto-detects installation directories for osu!stable and osu!lazer
│   │   ├── processDetector.ts      # Process scanner detecting running osu! instances (Windows/Linux/Mac)
│   │   ├── realmService.ts         # Opens and inspects osu!lazer client.realm (Read-only)
│   │   ├── settingsStore.ts        # Manages electron-store and safeStorage token encryption
│   │   ├── startupAutoDetect.ts    # Auto-detects game paths upon first launch
│   │   ├── updateService.ts        # Checks for updates from GitHub Releases via electron-updater
│   │   ├── collection/             # Beatmap collection processing
│   │   │   ├── collectionService.ts     # Parses collections and matches beatmapset metadata
│   │   │   ├── collectionSyncService.ts # Synchronizes collections between stable, lazer, and SQLite
│   │   │   ├── osuDirectService.ts      # Lookups missing beatmapset IDs via osu!direct API
│   │   │   ├── stableCollectionParser.ts # Parses osu!stable binary collection.db format
│   │   │   └── types.ts                 # Collection types, merge modes, and statistics
│   │   ├── database/               # Local SQLite management (beatmaps.db)
│   │   │   ├── beatmapFilterQuery.ts    # Constructs dynamic SQL search queries
│   │   │   ├── databaseService.ts       # SQLite handle management, migrations, beatmaps CRUD
│   │   │   ├── lazerImporter.ts         # Imports beatmaps from client.realm into SQLite
│   │   │   ├── schema.ts                # DDL schema for beatmaps and beatmapsets tables
│   │   │   ├── stableDbParserUtils.ts   # Transforms raw osu!.db binary data into standardized schema
│   │   │   ├── stableImporter.ts        # Spawns worker thread for osu!.db binary sync
│   │   │   ├── syncManager.ts           # Coordinates startup and periodic database synchronization
│   │   │   └── types.ts                 # Database types and synchronization progress events
│   │   ├── download/               # Download engine auxiliary modules
│   │   │   ├── downloadTargetValidator.ts # Validates disk space and destination directory safety
│   │   │   ├── httpDownloader.ts        # HTTP/HTTPS stream downloader with retry and pipeline logic
│   │   │   ├── oszMetadata.ts           # Validates ZIP integrity and reads .osu headers
│   │   │   ├── queuePersistence.ts      # Persists and restores interrupted download queue snapshots
│   │   │   └── types.ts                 # Download task and options data types
│   │   ├── types/                  # Shared service types
│   │   │   └── beatmapset.ts       # Beatmapset object definition
│   │   └── workers/                # Background Worker Threads
│   │       └── stableImportWorker.ts # Dedicated worker thread parsing large binary osu!.db files
│   ├── utils/                      # Cross-environment utilities
│   │   ├── beatmapTitle.ts         # Parses song title and artist from .osz filename
│   │   ├── env.ts                  # Development vs production environment helpers
│   │   └── fileUtils.ts            # Atomic disk writing (atomicWriteFile)
│   └── renderer/                   # User Interface (Chromium / Vue 3)
│       ├── index.html              # Shell HTML with initial loading skeleton
│       └── src/
│           ├── App.vue             # Root component (main layout, titlebar, sidebar, router view)
│           ├── env.d.ts            # Vite client environment types
│           ├── main.ts             # Vue application setup, Vuetify, icon aliases, i18n, error handlers
│           ├── router.ts           # Vue Router configuration (WebHashHistory)
│           ├── assets/             # Static resources
│           │   ├── main.css        # Global styles, CSS tokens, Vuetify & SimpleBar customizations
│           │   └── fonts/          # Bundled Torus Notched fonts
│           ├── components/         # Main Views and subcomponents
│           │   ├── Backup.vue      # Beatmap Backup View
│           │   ├── BeatmapFilter.vue # Beatmap Filter & Search View
│           │   ├── Download.vue    # Download Manager & Queue View
│           │   ├── Settings.vue    # Application Settings View
│           │   ├── backup/         # Subcards for Backup screen
│           │   │   ├── BackupActionCard.vue      # Action buttons and progress bars
│           │   │   ├── BackupCollectionsCard.vue # Collection selection list
│           │   │   └── BackupSourcesCard.vue     # Source selection (Stable, Lazer, All)
│           │   ├── common/         # Shared reusable components
│           │   │   ├── AppForm.vue               # Standardized form wrapper
│           │   │   ├── AppIsland.vue             # Rounded glassmorphism card container
│           │   │   ├── AppViewShell.vue          # Page shell with title and subtitle
│           │   │   └── PathField.vue             # Path input field with directory/file picker button
│           │   ├── download/       # Subcards for Download screen
│           │   │   ├── DownloadActiveTable.vue   # Active and completed downloads table
│           │   │   ├── DownloadQueueOverview.vue # Queue stats, transfer speed, control buttons
│           │   │   ├── DownloadRecoveryDialog.vue# Dialog for resuming interrupted downloads
│           │   │   └── DownloadSetupCard.vue     # Initialize new downloads from .bbak file
│           │   ├── filter/         # Subcards for Filter screen
│           │   │   ├── FilterCriteriaCard.vue    # Filter criteria inputs (Mode, Stars, BPM, Status)
│           │   │   ├── FilterResultsCard.vue     # Filter results list and export trigger
│           │   │   └── types.ts                  # Filter criteria data types
│           │   ├── layout/         # Layout structural components
│           │   │   ├── AppSidebar.vue            # Left navigation sidebar
│           │   │   └── AppTitlebar.vue           # Frameless window titlebar with window controls
│           │   └── settings/       # Subcards for Settings screen
│           │       ├── SettingsAboutCard.vue     # Version details, licenses, links
│           │       ├── SettingsDatabaseCard.vue  # Database and collection sync controls
│           │       ├── SettingsDiagnosticCard.vue# Log viewer, diagnostic export
│           │       ├── SettingsDownloadCard.vue  # Concurrency, mirrors, Beatconnect token
│           │       ├── SettingsPathsCard.vue     # Directory paths for stable, lazer, Songs
│           │       └── SettingsResetCard.vue     # Factory settings reset
│           ├── composables/        # Business logic and reactive UI state
│           │   ├── useBackupWorkflow.ts   # Backup estimation, preparation, and export flow
│           │   ├── useDownloadQueue.ts    # Download queue management, buffer flushing, recovery
│           │   ├── useDownloadSettings.ts # Download settings state and persistence
│           │   └── useUpdater.ts          # Application update notifications and download flow
│           ├── i18n/               # Internationalization system
│           │   ├── index.ts        # Vue I18n initialization
│           │   └── locales/        # Dictionaries (en.json, vi.json, ja.json)
│           └── utils/              # Renderer utilities
│               └── databaseStatus.ts      # Formatter for database sync status
├── tests/                          # Vitest test suites (mirroring src/)
│   ├── config/                     # Constants and mirror configuration tests
│   ├── main/                       # Window state persistence tests
│   ├── renderer/                   # i18n parity and UI utility tests
│   └── services/                   # Core services, pathGuards, database, downloader tests
├── package.json                    # Project configuration, dependencies, and npm scripts
├── electron.vite.config.ts         # electron-vite build configuration for main, preload, renderer
├── electron-builder.yml            # Packaging configuration for Windows/Linux/Mac (Installer & Portable)
├── eslint.config.mjs               # Flat ESLint config (TypeScript, Vue, Prettier)
├── vitest.config.ts                # Vitest configuration and strict coverage thresholds
└── ARCHITECTURAL_DIGEST.md         # Original technical architectural digest of the codebase
```
