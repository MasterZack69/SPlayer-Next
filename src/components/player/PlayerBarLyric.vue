<script setup lang="ts">
import { getWordSweepProgress } from "lyric-kit";
import { useStatusStore } from "@/stores/status";
import { useMediaStore } from "@/stores/media";
import { useSettingsStore } from "@/stores/settings";
import { prepareLyricMarkdown } from "@/utils/lyric/markdown";

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
const status = useStatusStore();
const media = useMediaStore();
const settings = useSettingsStore();
const visibility = useDocumentVisibility();
const viewport = ref<HTMLElement>();
const textElement = ref<HTMLElement>();
const overflow = ref(0);
const mainLines = computed(() => media.parsedLyric.filter((line) => !line.isBG));
const line = computed(() => {
  if (!settings.player.showLyricInBar || !status.isPlaying || media.lyricIndex < 0) return null;
  const time = media.parsedLyric[media.lyricIndex]?.startTime ?? 0;
  const current = mainLines.value.findLast((item) => item.startTime <= time);
  return current ? prepareLyricMarkdown(current, false) : null;
});
const original = computed(() => line.value?.words.map((word) => word.word).join("") ?? "");
const text = computed(() =>
  settings.player.barLyricMode === "translation" && line.value?.translatedLyric
    ? `${original.value}（${line.value.translatedLyric}）`
    : original.value,
);
const wordMode = computed(() => {
  const current = line.value;
  return (
    settings.player.barLyricMode === "word" &&
    !!current &&
    (current.words.length > 1 ||
      ["ttml", "lys", "yrc", "qrc", "krc"].includes(media.lyricFormat ?? "")) &&
    current.words.some((word) => word.endTime > word.startTime)
  );
});
const active = computed(() => visibility.value === "visible" && !status.isPlayerExpanded);
const time = computed(() => (active.value ? status.position + status.lyricOffsetMs : null));
const scroll = computed(() => {
  if (!line.value || time.value === null || !overflow.value) return 0;
  const duration = line.value.endTime - line.value.startTime;
  const progress =
    duration > 0 ? Math.max(0, Math.min(1, (time.value - line.value.startTime) / duration)) : 0;
  return -overflow.value * progress;
});
/** Measure overflow after lyric or viewport changes. */
const measure = (): void => {
  overflow.value = Math.max(
    0,
    (textElement.value?.scrollWidth ?? 0) - (viewport.value?.clientWidth ?? 0),
  );
};
useResizeObserver([viewport, textElement], measure);
watch(original, () => nextTick(measure));
</script>

<template>
  <Transition name="slide-up" mode="out-in">
    <div
      v-if="line && original"
      :key="`${line.startTime}:${original}`"
      ref="viewport"
      class="min-w-0 overflow-hidden text-on-surface-variant"
      :class="compact ? 'text-xs leading-tight mt-0.5' : 'text-sm mt-1'"
    >
      <span
        ref="textElement"
        class="inline-block whitespace-pre align-top transition-transform duration-200 ease-linear motion-reduce:transition-none"
        :style="{ transform: `translateX(${scroll}px)` }"
      >
        <template v-if="wordMode">
          <span
            v-for="(word, index) in line.words"
            :key="index"
            class="bar-word"
            :style="{
              '--progress': time === null ? 1 : getWordSweepProgress(word, line.startTime, time),
            }"
          >
            {{ word.word }}
          </span>
        </template>
        <template v-else>{{ text }}</template>
      </span>
    </div>
    <slot v-else />
  </Transition>
</template>

<style scoped>
.bar-word {
  color: transparent;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  background-image: linear-gradient(
    90deg,
    rgb(var(--s-on-surface)) calc(var(--progress) * 100%),
    rgb(var(--s-on-surface-variant) / 0.55) calc(var(--progress) * 100%)
  );
}
</style>
