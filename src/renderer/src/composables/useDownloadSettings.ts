import { ref, watch, type Ref } from 'vue'
import { DefaultBeatmapMirrors } from '../../../config/beatmapMirrors'
import { FRONTEND_DEFAULTS, STORAGE_KEYS } from '../../../config/frontendConstants'

interface DownloadSettingsReturn {
  threadCount: Ref<number>
  selectedSources: Ref<string[]>
  removeFromStable: Ref<boolean>
  removeFromLazer: Ref<boolean>
  noVideo: Ref<boolean>
  waitForDownloadsOnPause: Ref<boolean>
  load: () => void
}

export function useDownloadSettings(): DownloadSettingsReturn {
  const threadCount = ref(FRONTEND_DEFAULTS.THREAD_COUNT)
  const selectedSources = ref<string[]>(DefaultBeatmapMirrors.map((s) => s.name))
  const removeFromStable = ref(false)
  const removeFromLazer = ref(false)
  const noVideo = ref(false)
  const waitForDownloadsOnPause = ref(true)

  function save(): void {
    localStorage.setItem(
      STORAGE_KEYS.DOWNLOAD_SETTINGS,
      JSON.stringify({
        threadCount: threadCount.value,
        selectedSources: selectedSources.value,
        removeFromStable: removeFromStable.value,
        removeFromLazer: removeFromLazer.value,
        noVideo: noVideo.value,
        waitForDownloadsOnPause: waitForDownloadsOnPause.value
      })
    )
  }

  function load(): void {
    const raw = localStorage.getItem(STORAGE_KEYS.DOWNLOAD_SETTINGS)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      threadCount.value = s.threadCount ?? FRONTEND_DEFAULTS.THREAD_COUNT
      selectedSources.value = s.selectedSources?.length
        ? s.selectedSources
        : DefaultBeatmapMirrors.map((src) => src.name)
      removeFromStable.value = s.removeFromStable ?? false
      removeFromLazer.value = s.removeFromLazer ?? false
      noVideo.value = s.noVideo ?? false
      waitForDownloadsOnPause.value = s.waitForDownloadsOnPause ?? true
    } catch {
      // Ignore malformed saved data
    }
  }

  watch(
    [
      threadCount,
      selectedSources,
      removeFromStable,
      removeFromLazer,
      noVideo,
      waitForDownloadsOnPause
    ],
    save
  )

  return {
    threadCount,
    selectedSources,
    removeFromStable,
    removeFromLazer,
    noVideo,
    waitForDownloadsOnPause,
    load
  }
}
