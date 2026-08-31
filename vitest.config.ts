import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['out/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      thresholds: {
        'src/config/beatmapMirrors.ts': { statements: 95, branches: 95 },
        'src/services/beatmapMirrorService.ts': { statements: 90, branches: 75 },
        'src/services/database/databaseService.ts': { statements: 85, branches: 57 },
        'src/services/download/queuePersistence.ts': { statements: 90, branches: 85 },
        'src/services/download/httpDownloader.ts': { statements: 60, branches: 40 },
        'src/services/downloadService.ts': { statements: 25, branches: 20 },
        'src/main/pathGuards.ts': { statements: 87, branches: 84 }
      }
    }
  }
})
