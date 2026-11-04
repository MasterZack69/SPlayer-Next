<script setup lang="ts">
import { useMediaStore } from "@/stores/media";
import { useStatusStore } from "@/stores/status";
import CrossfadeCover from "./CrossfadeCover.vue";

withDefaults(defineProps<{ fullscreen?: boolean; am?: boolean }>(), {
  fullscreen: false,
  am: false,
});

const media = useMediaStore();
const status = useStatusStore();
const { isPlaying } = storeToRefs(status);
const visibility = useDocumentVisibility();

/** 加载中的歌曲使用队列当前项作为封面兜底。 */
const displayTrack = computed(() => media.track ?? status.currentTrack);
const coverIdentity = computed(() =>
  JSON.stringify([
    displayTrack.value?.source,
    displayTrack.value?.serverId,
    displayTrack.value?.id,
  ]),
);

/** Cache at most one full-resolution local cover. */
const hdCache = shallowRef<{ identity: string; data: string } | null>(null);

const coverSrc = computed(() =>
  hdCache.value && hdCache.value.identity === coverIdentity.value
    ? hdCache.value.data
    : displayTrack.value?.coverOriginal || displayTrack.value?.cover,
);

watchEffect(async (onCleanup) => {
  const identity = coverIdentity.value;
  const track = displayTrack.value;
  if (hdCache.value && hdCache.value.identity !== identity) hdCache.value = null;
  if (!status.isPlayerExpanded || status.trackLoading || !track?.id) return;
  if (track.source !== "local" || hdCache.value?.identity === identity) return;
  let canceled = false;
  onCleanup(() => {
    canceled = true;
  });
  const r = await window.api.player.getCoverRaw();
  if (canceled || coverIdentity.value !== identity || !r.success || !r.data) return;
  hdCache.value = { identity, data: r.data };
});
</script>

<template>
  <div
    data-player-cover="full"
    :class="
      fullscreen
        ? 'player-cover-fullscreen w-full h-full aspect-auto rounded-none bg-transparent overflow-hidden shrink-0'
        : am
          ? 'player-cover-am w-full aspect-square rounded-xl overflow-hidden shrink-0 shadow-[0_16px_40px_rgba(0,0,0,0.3)]'
          : [
              'player-cover',
              'w-full aspect-square rounded-[32px] overflow-hidden shrink-0',
              'shadow-[0_0_20px_10px_rgba(0,0,0,0.1)]',
              isPlaying ? 'scale-100' : 'scale-90',
            ]
    "
  >
    <CrossfadeCover
      v-if="am || fullscreen"
      :identity="coverIdentity"
      :src="coverSrc"
      :fallback="displayTrack?.cover"
      :active="status.isPlayerExpanded && visibility === 'visible'"
    />
    <DetailCover v-else :src="coverSrc" :fallback="displayTrack?.cover" class="size-full" />
  </div>
</template>

<style scoped>
.player-cover-am {
  transition: box-shadow 500ms ease-out;
}

.player-cover {
  transition:
    transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 500ms ease-out;
}

:global(html[data-reduced-motion] .player-cover),
:global(html[data-reduced-motion] .player-cover-am) {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .player-cover,
  .player-cover-am {
    transition: none;
  }
}

.player-cover-fullscreen {
  mask-image: linear-gradient(
    to right,
    rgba(0, 0, 0, 1) 0%,
    rgba(0, 0, 0, 0.98) 10%,
    rgba(0, 0, 0, 0.92) 22%,
    rgba(0, 0, 0, 0.82) 32%,
    rgba(0, 0, 0, 0.68) 42%,
    rgba(0, 0, 0, 0.52) 52%,
    rgba(0, 0, 0, 0.36) 62%,
    rgba(0, 0, 0, 0.22) 72%,
    rgba(0, 0, 0, 0.1) 82%,
    rgba(0, 0, 0, 0.03) 92%,
    rgba(0, 0, 0, 0) 100%
  );
}
</style>
