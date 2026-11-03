<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { useSettingsStore } from "@/stores/settings";
import { usePlaybackTime } from "@/composables/usePlaybackTime";
import { getCurrentTime } from "@/services/playback";
import { useFavorite } from "@/composables/useFavorite";
import { usePlaylistPicker } from "@/composables/usePlaylistPicker";
import { useImmersiveMode } from "@/composables/useImmersiveMode";
import { useTimeFormat } from "@/composables/useTimeFormat";
import { useProgressLyric } from "@/composables/useProgressLyric";
import Lyrics from "@/components/player/Lyrics/index.vue";
import { useWindowControls } from "@/composables/useWindowControls";
import * as player from "@/core/player";
import {
  playerTransitionActive,
  setPlayerExpanded,
  switchPlayerLayout,
} from "@/services/playerTransition";
import IconFavorite from "~icons/material-symbols/favorite-rounded";
import IconFavoriteOutline from "~icons/material-symbols/favorite-outline-rounded";
import type { CoverLayout } from "@/types/settings";
import IconLucideListPlus from "~icons/lucide/list-plus";

const status = useStatusStore();
const media = useMediaStore();
const settings = useSettingsStore();
const fav = useFavorite();
const {
  isPlaying,
  isLoading,
  position,
  duration,
  isPlayerExpanded,
  repeatMode,
  shuffleMode,
  heartMode,
  fmMode,
  showLyric,
} = storeToRefs(status);

const { timeDisplay, toggleTimeFormat } = useTimeFormat();
const { snapToNearestLyric } = useProgressLyric();

const lyricRef = ref<InstanceType<typeof Lyrics>>();
const lyricMounted = ref(false);
const lyricReady = ref(false);
const playerVisible = ref(false);
const visualizerMounted = ref(false);
const initialLyricTimeMs = ref(0);
let visualizerIdle = 0;
let enterPrepared = false;
const visibility = useDocumentVisibility();

/** Use the queue entry while track details load. */
const displayTrack = computed(() => media.track ?? status.currentTrack);
const hasLyric = computed(() => media.parsedLyric.length > 0 || media.lyricLoading);
const hasTrack = computed(() => !!displayTrack.value);

/** Push precise playback time in milliseconds. */
const { start: startTick, stop: stopTick } = usePlaybackTime((currentMs) => {
  if (!status.trackLoading && !media.lyricLoading) {
    lyricRef.value?.setCurrentTime(currentMs + status.lyricOffsetMs, player.isSeeking());
  }
});

/** Defer spectrum initialization until lyric layout and cover transitions settle. */
const scheduleVisualizers = (): void => {
  if (
    visualizerIdle ||
    visualizerMounted.value ||
    playerTransitionActive.value ||
    !isPlayerExpanded.value ||
    visibility.value !== "visible"
  ) {
    return;
  }
  visualizerIdle = requestIdleCallback(
    () => {
      visualizerIdle = 0;
      if (
        isPlayerExpanded.value &&
        !playerTransitionActive.value &&
        visibility.value === "visible"
      ) {
        visualizerMounted.value = true;
      }
    },
    { timeout: 500 },
  );
};

/** Schedule the spectrum after the first lyric layout. */
const onLyricReady = (): void => {
  if (!isPlayerExpanded.value) return;
  lyricReady.value = true;
  syncLyricActivity();
  scheduleVisualizers();
};

watch(visibility, (value) => {
  if (value === "visible" && lyricReady.value) scheduleVisualizers();
});

/** Prepare lyrics once per entry, reusing them during rapid close/reopen. */
const preparePlayerContent = (): void => {
  if (enterPrepared) return;
  enterPrepared = true;
  initialLyricTimeMs.value = getCurrentTime() + status.lyricOffsetMs;
  lyricMounted.value = true;
  nextTick(() => {
    if (!isPlayerExpanded.value) return;
    syncLyricActivity();
    if (lyricReady.value) scheduleVisualizers();
    else if (!hasLyric.value) onLyricReady();
  });
};

/** Start the background immediately, independently of deferred lyrics and spectrum. */
const onBeforeEnter = (): void => {
  playerVisible.value = true;
  enterPrepared = false;
};

/** Prepare lyrics after entry without competing with the shared cover animation. */
const onAfterEnter = (): void => {
  if (isPlayerExpanded.value && !playerTransitionActive.value) preparePlayerContent();
};

watch(playerTransitionActive, (active, previous, onCleanup) => {
  if (active || !previous || !isPlayerExpanded.value) return;
  const idle = requestIdleCallback(
    () => {
      if (!playerTransitionActive.value && isPlayerExpanded.value) preparePlayerContent();
    },
    { timeout: 300 },
  );
  onCleanup(() => cancelIdleCallback(idle));
});

/** Cancel deferred spectrum work and freeze lyrics before closing. */
const onBeforeLeave = (): void => {
  cancelIdleCallback(visualizerIdle);
  visualizerIdle = 0;
  lyricRef.value?.freeze();
  stopTick();
};

/** Release lyric and spectrum content after closing. */
const onAfterLeave = (): void => {
  playerVisible.value = false;
  lyricMounted.value = false;
  lyricReady.value = false;
  visualizerMounted.value = false;
};

onBeforeUnmount(() => cancelIdleCallback(visualizerIdle));

// Treat completed lyric loading without results as ready for spectrum initialization.
watch(hasLyric, (value) => {
  if (!lyricMounted.value) return;
  if (value) {
    initialLyricTimeMs.value = getCurrentTime() + status.lyricOffsetMs;
    return;
  }
  onLyricReady();
});

// 歌词变化时先推送精确时间
watch(
  () => media.parsedLyric,
  () => lyricRef.value?.setCurrentTime(getCurrentTime() + status.lyricOffsetMs),
);

const fullscreenCover = computed(() => settings.player.coverLayout === "fullscreen");
const fullscreenLyrics = computed(() => settings.player.coverLayout === "lyrics");
const amLayout = computed(() => settings.player.coverLayout === "am");
const layoutOpen = ref(false);
const layoutOptions: CoverLayout[] = ["default", "fullscreen", "lyrics", "am"];
/**
 * Switch layouts while preserving the saved cover preference.
 * @param layout - Selected player layout.
 */
const selectLayout = (layout: CoverLayout): void => {
  layoutOpen.value = false;
  if (settings.player.coverLayout === layout) return;
  switchPlayerLayout(() => {
    settings.player.coverLayout = layout;
  });
};
const coverWidth = computed(() => `${settings.player.coverLyricRatio * 100}%`);

const coverCentered = computed(() => {
  if (fullscreenCover.value || fullscreenLyrics.value || status.fullQueueOpen) return false;
  return (
    !showLyric.value || ((amLayout.value || settings.player.autoCenterCover) && !hasLyric.value)
  );
});

const handleLyricSeek = async (timeMs: number): Promise<void> => {
  await player.seek(timeMs);
  if (!isPlaying.value) await player.play();
};

const lyricFontSize = computed(() =>
  settings.lyric.adaptiveFontSize
    ? `calc(${settings.lyric.fontSize} / 1080 * 100vh)`
    : `${settings.lyric.fontSize}px`,
);

const lyricSubFontSize = computed(() =>
  settings.lyric.adaptiveFontSize
    ? `calc(${settings.lyric.translationFontSize} / 1080 * 100vh)`
    : `${settings.lyric.translationFontSize}px`,
);

const { immersive, onPlayerMouseEnter, onPlayerMouseLeave, onMainMove, onBarEnter, onBarLeave } =
  useImmersiveMode(isPlayerExpanded);

const { isFullscreen, toggleFullscreen } = useWindowControls();

const onSeekDragEnd = (value: number): void => {
  player.seek(snapToNearestLyric(value));
};

const {
  open: pickerOpen,
  tracks: pickerTracks,
  mode: pickerMode,
  openPicker,
} = usePlaylistPicker();

const lyricToggleDisabled = computed(
  () => !hasLyric.value || fullscreenCover.value || fullscreenLyrics.value,
);
const lyricToggleActive = computed(
  () =>
    showLyric.value &&
    hasLyric.value &&
    !status.fullQueueOpen &&
    !fullscreenCover.value &&
    !fullscreenLyrics.value,
);

/** Run lyric rendering only while its surface is visible. */
const syncLyricActivity = (): void => {
  const visible =
    (fullscreenCover.value || fullscreenLyrics.value || showLyric.value) &&
    hasLyric.value &&
    !status.fullQueueOpen;
  if (
    isPlayerExpanded.value &&
    enterPrepared &&
    lyricMounted.value &&
    visible &&
    visibility.value === "visible"
  ) {
    lyricRef.value?.setCurrentTime(getCurrentTime() + status.lyricOffsetMs);
    lyricRef.value?.resume();
    startTick();
  } else {
    stopTick();
    lyricRef.value?.freeze();
  }
};

watch(
  [
    isPlayerExpanded,
    lyricMounted,
    fullscreenCover,
    fullscreenLyrics,
    showLyric,
    hasLyric,
    () => status.fullQueueOpen,
    visibility,
  ],
  syncLyricActivity,
  { flush: "post" },
);

const toggleLyric = (): void => {
  if (status.fullQueueOpen) {
    status.fullQueueOpen = false;
    showLyric.value = true;
  } else {
    showLyric.value = !showLyric.value;
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition
      appear
      :css="!playerTransitionActive"
      enter-active-class="transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.3,1)]"
      leave-active-class="transition-transform duration-500 ease-[cubic-bezier(0.7,0,0.3,1)]"
      enter-from-class="translate-y-full"
      leave-to-class="translate-y-full"
      @after-enter="onAfterEnter"
      @before-enter="onBeforeEnter"
      @before-leave="onBeforeLeave"
      @after-leave="onAfterLeave"
    >
      <div
        v-show="isPlayerExpanded"
        class="player-panel fixed inset-0 z-200 overflow-hidden text-cover"
        :class="immersive ? 'cursor-none [&_*]:!cursor-none' : ''"
        style="--lp-color: rgb(var(--s-cover))"
        @mouseenter="onPlayerMouseEnter"
        @mouseleave="onPlayerMouseLeave"
      >
        <!-- Prepare the background during entry; only the spectrum waits for after-enter. -->
        <PlayerBackground :visible="playerVisible" :active="playerVisible" />
        <!-- 全屏封面 -->
        <div v-if="fullscreenCover" class="absolute inset-y-0 left-0 w-[60%]">
          <PlayerCover fullscreen />
        </div>
        <!-- 底部频谱 -->
        <BottomSpectrum
          v-if="isPlayerExpanded && visualizerMounted && settings.player.enableSpectrum"
          :show="isPlaying && immersive"
        />
        <!-- 顶/底栏渐变遮罩（全屏封面模式） -->
        <div
          v-if="fullscreenCover"
          class="cover-mask-top absolute top-0 inset-x-0 h-20 z-5 pointer-events-none transition-opacity duration-400"
          :class="immersive ? 'opacity-0' : 'opacity-100'"
        />
        <div
          v-if="fullscreenCover"
          class="cover-mask-bottom absolute bottom-0 inset-x-0 h-48 z-5 pointer-events-none transition-opacity duration-400"
          :class="immersive ? 'opacity-0' : 'opacity-100'"
        />
        <!-- 顶栏 -->
        <div
          class="absolute top-0 inset-x-0 h-14 z-10 app-drag-region transition-opacity duration-400 flex items-center justify-between px-3"
          :class="immersive && !layoutOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          @mouseenter="onBarEnter"
          @mouseleave="onBarLeave"
        >
          <div class="app-no-drag flex items-center gap-2">
            <SButton
              v-if="!amLayout"
              type="cover"
              variant="ghost"
              circle
              :size="40"
              :disabled="lyricToggleDisabled"
              :class="lyricToggleActive ? 'opacity-100' : 'opacity-40'"
              @click="toggleLyric"
            >
              <template #icon><IconLucideTextQuote /></template>
            </SButton>
          </div>
          <div class="app-no-drag flex items-center gap-3">
            <SPopover
              v-model:open="layoutOpen"
              trigger="click"
              side="bottom"
              align="end"
              :side-offset="8"
              cover
            >
              <template #trigger>
                <SButton
                  type="cover"
                  variant="ghost"
                  circle
                  :size="40"
                  :aria-label="$t('settings.coverLayout.label')"
                >
                  <template #icon><IconLucideLayoutTemplate /></template>
                </SButton>
              </template>
              <div
                class="flex flex-col gap-2"
                role="group"
                :aria-label="$t('settings.coverLayout.label')"
              >
                <button
                  v-for="layout in layoutOptions"
                  :key="layout"
                  type="button"
                  class="border-none bg-transparent rounded-lg px-3 py-2 text-left text-cover cursor-pointer hover:bg-cover/10 focus-visible:outline focus-visible:outline-2"
                  :aria-pressed="settings.player.coverLayout === layout"
                  :class="settings.player.coverLayout === layout ? 'bg-cover/14' : ''"
                  @click="selectLayout(layout)"
                >
                  {{ $t(`settings.coverLayout.${layout}`) }}
                </button>
              </div>
            </SPopover>
            <SButton type="cover" variant="ghost" circle :size="40" @click="toggleFullscreen">
              <template #icon>
                <IconLucideMinimize v-if="isFullscreen" />
                <IconLucideMaximize v-else />
              </template>
            </SButton>
            <WindowControls cover />
          </div>
        </div>
        <div
          v-if="amLayout"
          class="app-no-drag absolute top-4 left-1/2 -translate-x-1/2 z-20 transition-opacity"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          @mouseenter="onBarEnter"
          @mouseleave="onBarLeave"
        >
          <SButton
            type="cover"
            variant="ghost"
            size="auto"
            class="px-4 py-3 rounded-full"
            :aria-label="$t('player.am.collapse')"
            @click="setPlayerExpanded(false)"
          >
            <span class="block w-14 h-1.2 rounded-full bg-cover/40" />
          </SButton>
        </div>
        <!-- 主区域 -->
        <div
          class="absolute top-14 inset-x-0 bottom-20"
          :class="amLayout ? 'am-main' : ''"
          @mousemove="onMainMove"
        >
          <div
            v-if="amLayout"
            class="am-left absolute inset-y-0 left-0 w-[45%] flex items-center justify-center transition-transform duration-500"
            :class="coverCentered ? 'am-centered' : ''"
          >
            <div class="am-column w-[min(50vh,38vw)] flex flex-col gap-[clamp(0.5rem,4vh,2.5rem)]">
              <PlayerCover am />
              <AmControls
                v-if="playerVisible"
                @add-to-playlist="displayTrack && openPicker([displayTrack])"
              />
            </div>
          </div>
          <!-- 左侧 -->
          <div
            v-if="!fullscreenCover && !fullscreenLyrics && !amLayout"
            class="absolute inset-y-0 left-0 flex items-center justify-center px-12 transition-transform duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
            :style="{
              width: coverWidth,
              transform: coverCentered ? 'translateX(calc(50vw - 50%))' : undefined,
            }"
          >
            <div class="relative w-[clamp(200px,85%,50vh)] -translate-y-[11vh]">
              <Transition name="scale-switch" mode="out-in">
                <div :key="displayTrack?.id">
                  <PlayerCover />
                  <div class="absolute top-full left-0 w-full pt-6">
                    <PlayerData align="left" />
                  </div>
                </div>
              </Transition>
            </div>
          </div>
          <!-- 右侧 -->
          <div
            class="group absolute inset-y-0 right-0 flex flex-col transition-opacity duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
            :class="[
              coverCentered || status.fullQueueOpen
                ? 'opacity-0 pointer-events-none'
                : 'opacity-100',
              fullscreenLyrics ? 'px-[clamp(1rem,5vw,5rem)]' : 'pr-[clamp(1rem,5vw,5rem)]',
              amLayout ? 'am-right' : '',
            ]"
            :style="{
              width: amLayout
                ? '55%'
                : fullscreenLyrics
                  ? '100%'
                  : fullscreenCover
                    ? '50%'
                    : `calc(100% - ${coverWidth})`,
            }"
          >
            <!-- 全屏封面 -->
            <div
              v-if="fullscreenCover || fullscreenLyrics"
              class="shrink-0 pt-2 pb-6 pl-[calc(1em-0.5rem)]"
              :style="{ fontSize: lyricFontSize }"
            >
              <PlayerData align="left" simple />
            </div>
            <!-- 歌词容器 -->
            <div
              class="lyric-area relative flex-1 min-h-0"
              :style="{
                '--lp-credit-opacity': '1',
                fontSize: lyricFontSize,
                '--lp-sub-font-size': lyricSubFontSize,
                // 副行透明度恒定，激活/非激活的明暗由行级透明度负责（与旧版 SPlayer 一致）
                '--lp-sub-active-opacity': '0.6',
                '--lp-sub-inactive-opacity': '0.6',
                fontWeight: String(settings.lyric.fontWeight),
                fontFamily: settings.lyric.fontFamily || undefined,
                '--lyric-font-zh': settings.lyric.fontFamilyChinese || undefined,
                '--lyric-font-ja': settings.lyric.fontFamilyJapanese || undefined,
                '--lyric-font-ko': settings.lyric.fontFamilyKorean || undefined,
                '--lyric-font-latin': settings.lyric.fontFamilyLatin || undefined,
                mixBlendMode: 'normal',
              }"
            >
              <Lyrics
                v-if="lyricMounted && hasLyric"
                ref="lyricRef"
                :lyric-lines="media.parsedLyric"
                :lyric-format="media.lyricFormat"
                :initial-time="initialLyricTimeMs"
                :playing="isPlaying"
                @seek="handleLyricSeek"
                @ready="onLyricReady"
              />
              <div
                v-else-if="lyricMounted"
                class="w-full h-full flex items-center justify-center text-cover/30"
              >
                暂无歌词
              </div>
            </div>
            <!-- 歌词侧边工具栏 -->
            <LyricActions :immersive="immersive" />
          </div>
          <!-- 播放队列 -->
          <div
            class="absolute inset-y-0 right-0 pl-4 py-6 flex items-center"
            :class="[status.fullQueueOpen ? '' : 'pointer-events-none', amLayout ? 'am-queue' : '']"
            :style="{
              width: amLayout
                ? '55%'
                : fullscreenLyrics
                  ? 'min(100%, 640px)'
                  : fullscreenCover
                    ? '50%'
                    : `calc(100% - ${coverWidth})`,
            }"
          >
            <Transition
              enter-active-class="transition-opacity duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
              enter-from-class="opacity-0"
              leave-active-class="transition-opacity duration-600 ease-[cubic-bezier(0.4,0,0.2,1)]"
              leave-to-class="opacity-0"
            >
              <div v-if="status.fullQueueOpen" class="w-full h-full">
                <QueuePanel @close="status.fullQueueOpen = false" />
              </div>
            </Transition>
          </div>
        </div>
        <!-- 底栏 -->
        <div
          v-if="amLayout"
          class="absolute bottom-0 inset-x-0 h-20 z-10 flex items-center justify-end gap-2 px-4 transition-opacity duration-400"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          @mouseenter="onBarEnter"
          @mouseleave="onBarLeave"
        >
          <SButton
            type="cover"
            variant="ghost"
            circle
            size="large"
            :disabled="!hasLyric"
            :aria-label="$t('player.am.lyrics')"
            :aria-pressed="lyricToggleActive"
            @click="toggleLyric"
          >
            <template #icon>
              <IconSpAmLyricsActive v-if="lyricToggleActive" />
              <IconSpAmLyrics v-else />
            </template>
          </SButton>
          <Toolbar cover am />
        </div>
        <div
          v-else
          class="absolute bottom-0 inset-x-0 h-20 z-10 flex items-center gap-4 px-4 transition-opacity duration-400"
          :class="immersive ? 'opacity-0 pointer-events-none' : 'opacity-100'"
          @mouseenter="onBarEnter"
          @mouseleave="onBarLeave"
        >
          <div class="flex-1 min-w-0 flex items-center justify-start gap-2">
            <SButton
              type="cover"
              variant="ghost"
              size="large"
              circle
              @click="setPlayerExpanded(false)"
            >
              <template #icon><IconLucideChevronDown /></template>
            </SButton>
            <SButton
              type="cover"
              variant="ghost"
              size="large"
              circle
              :disabled="!hasTrack || !fav.isSupported(displayTrack)"
              @click="fav.toggle(displayTrack)"
            >
              <template #icon>
                <SIconSwap :active="fav.isLiked(displayTrack)">
                  <template #on><IconFavorite /></template>
                  <template #off><IconFavoriteOutline /></template>
                </SIconSwap>
              </template>
            </SButton>
            <SButton
              v-if="displayTrack?.source === 'local' || displayTrack?.source === 'netease'"
              type="cover"
              variant="ghost"
              size="large"
              circle
              @click="displayTrack && openPicker([displayTrack])"
            >
              <template #icon><IconLucideListPlus /></template>
            </SButton>
          </div>
          <div class="shrink-0 flex flex-col items-center gap-1 w-[clamp(360px,35%,480px)]">
            <div class="flex items-center gap-3">
              <SButton
                type="cover"
                variant="ghost"
                circle
                @click="
                  fmMode
                    ? player.dislikeFmTrack()
                    : heartMode
                      ? player.exitHeartMode()
                      : player.toggleShuffleMode()
                "
              >
                <template #icon>
                  <IconLucideHeartOff v-if="fmMode" />
                  <IconSpHeartMode v-else-if="heartMode" />
                  <IconLucideShuffle v-else-if="shuffleMode === 'on'" />
                  <IconSpPlayOrder v-else />
                </template>
              </SButton>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="!hasTrack || fmMode"
                @click="player.prevTrack()"
              >
                <template #icon><IconLucideSkipBack /></template>
              </SButton>
              <SButton
                type="cover"
                variant="secondary"
                size="large"
                circle
                :loading="isLoading"
                :disabled="!hasTrack && !isLoading"
                @click="player.togglePlay()"
              >
                <template #icon>
                  <SIconSwap :active="isPlaying">
                    <template #on><IconLucidePause /></template>
                    <template #off><IconLucidePlay /></template>
                  </SIconSwap>
                </template>
              </SButton>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="!hasTrack"
                @click="player.nextTrack()"
              >
                <template #icon><IconLucideSkipForward /></template>
              </SButton>
              <SButton
                type="cover"
                variant="ghost"
                circle
                :disabled="fmMode"
                :class="fmMode ? 'opacity-40' : 'opacity-100'"
                @click="player.cycleRepeatMode()"
              >
                <template #icon>
                  <IconLucideInfinity v-if="fmMode" />
                  <IconLucideRepeat1 v-else-if="repeatMode === 'one'" />
                  <IconLucideRepeat v-else />
                </template>
              </SButton>
            </div>
            <div class="flex items-center gap-2 w-full">
              <span
                class="text-xs text-cover/50 tabular-nums min-w-9 text-center cursor-pointer px-1.5 py-0.5 rounded-md transition-colors hover:bg-cover/10"
                @click="toggleTimeFormat"
              >
                {{ timeDisplay[0] }}
              </span>
              <SSlider
                :model-value="position"
                :glow="status.transitioning"
                :min="0"
                :max="duration"
                :step="100"
                :always-show-thumb="false"
                cover
                class="flex-1"
                @drag-end="onSeekDragEnd"
              />
              <span
                class="text-xs text-cover/50 tabular-nums min-w-9 text-center cursor-pointer px-1.5 py-0.5 rounded-md transition-colors hover:bg-cover/10"
                @click="toggleTimeFormat"
              >
                {{ timeDisplay[1] }}
              </span>
            </div>
          </div>
          <div class="flex-1 min-w-0 flex items-center justify-end">
            <Toolbar cover />
          </div>
        </div>
      </div>
    </Transition>
    <PlaylistPickerDialog v-model:open="pickerOpen" :mode="pickerMode" :tracks="pickerTracks" />
  </Teleport>
</template>

<style scoped>
.am-left {
  overflow-y: auto;
}
.am-column {
  margin: auto;
  flex-shrink: 0;
}
.am-centered {
  transform: translateX(calc(50vw - 50%));
}
@media (max-width: 700px) {
  .am-left {
    top: 0;
    bottom: auto;
    width: 100%;
    height: 52%;
    padding: 0 1rem;
    overflow-y: auto;
  }
  .am-left.am-centered {
    height: 100%;
    transform: none;
  }
  .am-column {
    width: min(100%, 480px);
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
  }
  .am-column :deep(.player-cover-am) {
    width: min(28vw, 22vh);
    align-self: center;
  }
  .am-column :deep(.am-controls) {
    flex: 1;
    min-width: 0;
  }
  .am-right,
  .am-queue {
    top: 52%;
    bottom: 0;
    width: 100% !important;
    padding: 0 1rem;
  }
}
:global(html[data-reduced-motion] .am-left) {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .am-left {
    transition: none;
  }
}

.lyric-area {
  filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2));
  mask: linear-gradient(
    180deg,
    hsla(0, 0%, 100%, 0) 0,
    hsla(0, 0%, 100%, 0.6) 5%,
    #fff 10%,
    #fff 75%,
    hsla(0, 0%, 100%, 0.6) 85%,
    hsla(0, 0%, 100%, 0)
  );
}

/* 顶部/底部遮罩：多段非线性 alpha，避免暗色渐变出色阶 */
.cover-mask-top {
  background-image: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.44) 12%,
    rgba(0, 0, 0, 0.36) 25%,
    rgba(0, 0, 0, 0.27) 40%,
    rgba(0, 0, 0, 0.18) 55%,
    rgba(0, 0, 0, 0.1) 70%,
    rgba(0, 0, 0, 0.04) 85%,
    rgba(0, 0, 0, 0) 100%
  );
}

.cover-mask-bottom {
  background-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.44) 12%,
    rgba(0, 0, 0, 0.36) 25%,
    rgba(0, 0, 0, 0.27) 40%,
    rgba(0, 0, 0, 0.18) 55%,
    rgba(0, 0, 0, 0.1) 70%,
    rgba(0, 0, 0, 0.04) 85%,
    rgba(0, 0, 0, 0) 100%
  );
}
</style>
