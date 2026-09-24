<template>
  <AppIsland
    :title="$t('settings.about.title') || 'Thông tin & Cập nhật'"
    icon="$informationOutline"
    card-class="mb-4"
  >
    <div class="about-card-container">
      <!-- App Header Banner -->
      <div class="d-flex align-center ga-5">
        <img :src="logoUrl" alt="Logo" class="about-logo" />
        <div class="d-flex flex-column ga-1">
          <div class="d-flex align-center ga-2 flex-wrap">
            <span class="font-weight-bold app-title-text">Beatmap Backup</span>
            <span v-if="displayAppVersion" class="about-version-badge"
              >v{{ displayAppVersion }}</span
            >
          </div>
          <div class="d-flex align-center ga-2 mt-1">
            <span class="about-installation-label">
              {{ $t('settings.about.installationType') }}:
            </span>
            <v-chip
              size="small"
              color="primary"
              variant="flat"
              class="font-weight-medium about-dist-chip"
            >
              {{ distributionLabel }}
            </v-chip>
          </div>
        </div>
      </div>

      <v-divider class="my-5 about-divider"></v-divider>

      <!-- Description & Features -->
      <div class="text-body-2 text-medium-emphasis about-description" :lang="currentLocale">
        {{
          $t('settings.about.description') ||
          'Công cụ sao lưu và đồng bộ bộ sưu tập beatmap cho osu!stable và osu!lazer.'
        }}
      </div>

      <!-- Inline Update Info & Changelog Section -->
      <v-expand-transition>
        <div
          v-if="
            updateStatus === 'available' ||
            updateStatus === 'downloading' ||
            updateStatus === 'downloaded'
          "
          class="update-banner pa-4 rounded-lg mt-4"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
            <div class="d-flex align-center ga-2">
              <v-icon icon="$update" color="primary" size="20" />
              <span class="text-subtitle-2 font-weight-bold">
                {{ $t('updater.newVersionAvailable') }}:
                <span class="text-primary font-weight-black">v{{ latestVersion }}</span>
              </span>
              <span
                v-if="formattedReleaseDate(currentLocale)"
                class="text-caption text-medium-emphasis"
              >
                ({{ formattedReleaseDate(currentLocale) }})
              </span>
            </div>
            <v-chip
              size="x-small"
              variant="tonal"
              color="primary"
              class="font-weight-medium about-dist-chip"
            >
              {{ distributionLabel }}
            </v-chip>
          </div>

          <!-- Notice for Portable or Linux -->
          <v-alert
            v-if="distributionType === 'win-portable'"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3 text-caption"
            icon="$helpCircleOutline"
          >
            {{ $t('updater.portableNotice') }}
          </v-alert>
          <v-alert
            v-else-if="distributionType === 'linux-appimage' || distributionType === 'linux-other'"
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3 text-caption"
            icon="$downloadBox"
          >
            {{ $t('updater.linuxNotice') }}
          </v-alert>

          <!-- Changelog / Release Notes Box -->
          <div v-if="releaseNotes" class="release-notes-box pa-3 rounded-lg mb-3">
            <div
              class="text-caption font-weight-bold text-medium-emphasis mb-1 d-flex align-center ga-1"
            >
              <v-icon icon="$fileDocumentOutline" size="14" />
              {{ $t('updater.changelog') }}
            </div>
            <div
              class="release-notes-content text-caption"
              v-html="sanitizedReleaseNotes"
              @click="handleChangelogClick"
            ></div>
          </div>

          <!-- Download Progress (when downloading) -->
          <div v-if="updateStatus === 'downloading'" class="mb-3">
            <div class="d-flex justify-space-between text-caption font-weight-medium mb-1">
              <span>{{ $t('updater.downloading') }}</span>
              <span class="font-weight-bold">{{ Math.round(updateProgress.percent) }}%</span>
            </div>
            <v-progress-linear
              :model-value="updateProgress.percent"
              color="primary"
              height="6"
              rounded
              class="mb-1"
            />
            <div class="d-flex justify-space-between text-caption text-medium-emphasis">
              <span>{{ formattedTransferred }}</span>
              <span>{{ formattedSpeed }}</span>
            </div>
          </div>

          <!-- Action Buttons for update -->
          <div class="d-flex align-center justify-end ga-2">
            <v-btn
              v-if="updateStatus === 'downloaded' && isInstaller"
              color="primary"
              size="small"
              class="update-action-btn"
              prepend-icon="$refresh"
              @click="installUpdate"
            >
              <span class="update-action-btn-text">{{ $t('updater.restartAndInstall') }}</span>
            </v-btn>

            <v-btn
              v-else-if="updateStatus === 'available'"
              color="primary"
              size="small"
              class="update-action-btn"
              :prepend-icon="isPortableOrOther ? '$export' : '$download'"
              @click="doUpdate"
            >
              <span class="update-action-btn-text">{{ updateActionLabel }}</span>
            </v-btn>
          </div>
        </div>
      </v-expand-transition>

      <!-- Actions & External Links -->
      <div class="d-flex flex-wrap align-center justify-space-between ga-3 pt-3">
        <div class="d-flex align-center flex-wrap ga-3">
          <v-btn
            variant="outlined"
            size="small"
            color="primary"
            class="update-action-btn"
            prepend-icon="$update"
            :loading="updateStatus === 'checking'"
            :lang="currentLocale"
            @click="() => checkForUpdates(true)"
          >
            <span class="update-action-btn-text">{{ $t('updater.checkUpdate') }}</span>
          </v-btn>

          <!-- Inline feedback messages -->
          <span
            v-if="updateStatus === 'up-to-date'"
            class="text-caption text-success font-weight-medium d-inline-flex align-center ga-1"
          >
            <v-icon icon="$checkCircle" size="16" />
            {{ $t('updater.upToDate') }}
          </span>

          <span
            v-else-if="updateStatus === 'error'"
            class="text-caption text-error font-weight-medium d-inline-flex align-center ga-1"
          >
            <v-icon icon="$alertCircle" size="16" />
            {{ errorMessage || $t('updater.defaultError') }}
          </span>

          <v-btn variant="text" size="small" :lang="currentLocale" @click="openGitHub">
            GitHub Repository ↗
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis">MIT License · © 2026 vnDarkBlue</div>
      </div>
    </div>
  </AppIsland>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIsland from '../common/AppIsland.vue'
import logoUrl from '../../assets/logo.png'
import { useUpdater } from '../../composables/useUpdater'

defineProps<{
  currentLocale: string
}>()

const { t } = useI18n()
const appVersion = ref('')

const {
  updateStatus,
  latestVersion,
  distributionType,
  updateProgress,
  releaseNotes,
  errorMessage,
  isInstaller,
  isPortableOrOther,
  formattedReleaseDate,
  formattedTransferred,
  formattedSpeed,
  distributionLabel,
  initialize: initializeUpdater,
  checkForUpdates,
  doUpdate,
  installUpdate
} = useUpdater()

const displayAppVersion = computed(() => {
  const v = appVersion.value || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')
  return v.replace(/^v/, '')
})

const updateActionLabel = computed(() => {
  if (isPortableOrOther.value) return t('updater.goToRelease')
  if (distributionType.value === 'linux-appimage') return t('updater.downloadAppImage')
  return t('updater.downloadAndInstall')
})

const openGitHub = (): void => {
  if (window.electronAPI?.system?.openExternal) {
    void window.electronAPI.system.openExternal('https://github.com/vndarkblue/beatmap-backup')
  } else {
    window.open('https://github.com/vndarkblue/beatmap-backup', '_blank')
  }
}

const handleChangelogClick = (event: MouseEvent): void => {
  const target = (event.target as HTMLElement)?.closest('a')
  if (target && target.href) {
    event.preventDefault()
    if (window.electronAPI?.system?.openExternal) {
      void window.electronAPI.system.openExternal(target.href)
    } else {
      window.open(target.href, '_blank')
    }
  }
}

const sanitizedReleaseNotes = computed(() => {
  if (!releaseNotes.value) return ''

  let content = releaseNotes.value.trim()
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content)

  if (!hasHtmlTags) {
    // Escape HTML entities to prevent injection from raw markdown
    content = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // Headers ## Header -> <h4>Header</h4>
    content = content.replace(/^###?\s+(.+)$/gm, '<h4 class="font-weight-bold my-1">$1</h4>')
    content = content.replace(/^#\s+(.+)$/gm, '<h3 class="font-weight-bold my-1">$1</h3>')

    // Bold **text** -> <strong>text</strong>
    content = content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    // Inline code `code` -> <code>code</code>
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>')

    // Markdown links [title](url) -> <a href="url" target="_blank" rel="noopener noreferrer">title</a>
    content = content.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )

    // Raw URLs https://... -> <a href="url" target="_blank" rel="noopener noreferrer">url</a>
    content = content.replace(
      /(?<!href="|">)(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    )

    // Convert bullet lists
    const lines = content.split(/\r?\n/)
    const formattedLines: string[] = []
    let inList = false

    for (const line of lines) {
      const listMatch = line.match(/^(\s*)[*-]\s+(.+)$/)
      if (listMatch) {
        if (!inList) {
          formattedLines.push('<ul>')
          inList = true
        }
        formattedLines.push(`<li>${listMatch[2]}</li>`)
      } else {
        if (inList) {
          formattedLines.push('</ul>')
          inList = false
        }
        if (line.trim()) {
          formattedLines.push(`<p>${line}</p>`)
        }
      }
    }
    if (inList) {
      formattedLines.push('</ul>')
    }
    content = formattedLines.join('\n')
  }

  // Sanitize: strip dangerous tags
  content = content.replace(
    /<\/?(script|style|iframe|object|embed|form|input|button|link|meta)[\s\S]*?>/gi,
    ''
  )
  // Strip on* attributes
  content = content.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Strip javascript: URLs
  content = content.replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*["']/gi, '$1="#"')

  return content
})

onMounted(async () => {
  try {
    if (window.electronAPI?.updater?.getAppVersion) {
      appVersion.value = await window.electronAPI.updater.getAppVersion()
    }
  } catch (err) {
    console.warn('Failed to load app version:', err)
  }
  void initializeUpdater()
})
</script>

<style scoped>
.about-card-container {
  padding: 4px 0 8px 0;
}

.about-logo {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  box-shadow: 0 4px 20px rgba(255, 102, 170, 0.28);
  flex-shrink: 0;
}

.app-title-text {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.2px;
}

.about-version-badge {
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(255, 102, 170, 0.16);
  color: var(--accent-pink);
  padding: 1px 8px;
  border-radius: 6px;
  letter-spacing: 0.5px;
  display: inline-block;
}

.about-installation-label {
  font-size: 0.85rem;
  color: var(--text-muted-color);
}

.about-dist-chip {
  font-size: 0.75rem !important;
  height: 22px !important;
  border-radius: 6px !important;
}

.about-dist-chip :deep(.v-chip__content) {
  display: inline-flex;
  align-items: center;
  line-height: 1 !important;
  position: relative;
  top: -1px;
}

:root[lang='ja'] .about-dist-chip :deep(.v-chip__content),
html[lang='ja'] .about-dist-chip :deep(.v-chip__content),
body[lang='ja'] .about-dist-chip :deep(.v-chip__content),
.v-application[lang='ja'] .about-dist-chip :deep(.v-chip__content),
[lang='ja'] .about-dist-chip :deep(.v-chip__content) {
  top: -1.5px;
}

.about-divider {
  border-color: var(--card-border-color) !important;
  opacity: 0.6;
}

.about-description {
  line-height: 1.6;
}

.update-banner {
  background: rgba(255, 102, 170, 0.06);
  border: 1px solid rgba(255, 102, 170, 0.25);
}

.release-notes-box {
  background: rgba(var(--v-theme-surface), 0.7);
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--card-border-color);
}

.release-notes-content {
  line-height: 1.6;
  word-break: break-word;
  color: var(--main-text-color);
}

.release-notes-content :deep(p) {
  margin-bottom: 6px;
}

.release-notes-content :deep(p:last-child) {
  margin-bottom: 0;
}

.release-notes-content :deep(ul),
.release-notes-content :deep(ol) {
  padding-left: 20px;
  margin-bottom: 6px;
}

.release-notes-content :deep(li) {
  margin-bottom: 3px;
}

.release-notes-content :deep(a) {
  color: var(--accent-pink);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.release-notes-content :deep(a:hover) {
  opacity: 0.8;
}

.release-notes-content :deep(code),
.release-notes-content :deep(tt) {
  font-family: monospace;
  font-size: 0.85em;
  background: rgba(255, 102, 170, 0.12);
  color: var(--accent-pink);
  padding: 1px 5px;
  border-radius: 4px;
}

.release-notes-content :deep(strong),
.release-notes-content :deep(b) {
  font-weight: 700;
}

.release-notes-content :deep(h1),
.release-notes-content :deep(h2),
.release-notes-content :deep(h3),
.release-notes-content :deep(h4) {
  font-size: 0.95rem;
  font-weight: 700;
  margin-top: 8px;
  margin-bottom: 4px;
  color: var(--main-text-color);
}

.update-action-btn {
  letter-spacing: 0.3px;
}

.update-action-btn :deep(.v-btn__content) {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.update-action-btn :deep(.v-btn__prepend) {
  display: inline-flex;
  align-items: center;
  margin-inline-end: 6px;
}

.update-action-btn-text {
  display: inline-flex;
  align-items: center;
  line-height: 1;
  position: relative;
  top: -0.5px;
}

:root[lang='ja'] .update-action-btn-text,
html[lang='ja'] .update-action-btn-text,
body[lang='ja'] .update-action-btn-text,
.v-application[lang='ja'] .update-action-btn-text,
[lang='ja'] .update-action-btn-text {
  top: -1.5px;
}
</style>
