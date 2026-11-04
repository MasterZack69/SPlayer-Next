<script setup lang="ts">
interface CoverLayer {
  id: number;
  identity: string;
  src?: string;
  fallback?: string;
  visible: boolean;
}

const props = defineProps<{
  identity: string;
  src?: string;
  fallback?: string;
  active: boolean;
}>();
const layers = ref<CoverLayer[]>([]);
let nextId = 0;
let removeTimer: ReturnType<typeof setTimeout> | undefined;

/** Determine whether cover transitions should be skipped. */
const reducedMotion = (): boolean =>
  document.documentElement.hasAttribute("data-reduced-motion") ||
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Release an old layer and cancel any pending cleanup. */
const clearTimer = (): void => {
  if (removeTimer) clearTimeout(removeTimer);
  removeTimer = undefined;
};

watch(
  () => [props.identity, props.src, props.fallback, props.active] as const,
  ([identity, src, fallback, active]) => {
    const current = layers.value.find((layer) => layer.identity === identity);
    if (current && layers.value.at(-1)?.id === current.id) {
      current.src = src;
      current.fallback = fallback;
      if (!active) {
        clearTimer();
        current.visible = true;
        layers.value = [current];
      }
      return;
    }
    clearTimer();
    const previous =
      active && !reducedMotion() ? layers.value.findLast((layer) => layer.visible) : undefined;
    const next = { id: ++nextId, identity, src, fallback, visible: !previous };
    layers.value = previous ? [previous, next] : [next];
  },
  { immediate: true },
);

/**
 * Reveal only the latest decoded cover and release the previous layer after its fade.
 * @param id - Identifier of the layer that has finished decoding.
 */
const onReady = (id: number): void => {
  const current = layers.value.at(-1);
  if (!current || current.id !== id || current.visible) return;
  layers.value.forEach((layer) => {
    layer.visible = layer.id === id;
  });
  clearTimer();
  if (!props.active || reducedMotion()) {
    layers.value = [current];
    return;
  }
  removeTimer = setTimeout(() => {
    if (layers.value.at(-1)?.id === id) layers.value = [current];
    removeTimer = undefined;
  }, 500);
};

onBeforeUnmount(clearTimer);
</script>

<template>
  <div class="relative size-full overflow-hidden">
    <DetailCover
      v-for="layer in layers"
      :key="layer.id"
      :src="layer.src"
      :fallback="layer.fallback"
      report-ready
      class="cover-layer absolute inset-0 size-full"
      :style="{ opacity: layer.visible ? 1 : 0 }"
      @ready="onReady(layer.id)"
    />
  </div>
</template>

<style scoped>
.cover-layer {
  transition: opacity 500ms ease;
}
:global(html[data-reduced-motion] .cover-layer) {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .cover-layer {
    transition: none;
  }
}
</style>
