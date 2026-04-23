import { ref, watch, type Ref } from 'vue'
import { DefaultBeatmapMirrors } from '../../../config/beatmapMirrors'

const STORAGE_KEY = 'downloadSettings'

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
  const threadCount = ref(5)
  const selectedSources = ref<string[]>(DefaultBeatmapMirrors.map((s) => s.name))
  const removeFromStable = ref(false)
  const removeFromLazer = ref(false)
  const noVideo = ref(false)
  const waitForDownloadsOnPause = ref(true)

  function save(): void {
    localStorage.setItem(
      STORAGE_KEY,
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
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      threadCount.value = s.threadCount ?? 5
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
