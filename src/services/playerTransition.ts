import { useSettingsStore } from "@/stores/settings";
import { useStatusStore } from "@/stores/status";
import { coverTransitionActive } from "@/services/coverTransition";

export const fullPlayerReady = shallowRef(false);
export const playerTransition = shallowRef<ViewTransition | null>(null);
export const playerTransitionActive = computed(() => playerTransition.value !== null);
let covers: HTMLElement[] = [];
let layoutTransition: ViewTransition | null = null;
let pendingLayoutUpdate: (() => void) | null = null;

/** Cancel an in-flight layout snapshot before another transition. */
const cancelLayoutTransition = (): void => {
  const active = layoutTransition;
  layoutTransition = null;
  pendingLayoutUpdate?.();
  pendingLayoutUpdate = null;
  active?.skipTransition();
};

/**
 * Switch a player layout with an optional reduced-motion-aware snapshot.
 * @param update - Apply the selected layout.
 */
export const switchPlayerLayout = (update: () => void): void => {
  cancelLayoutTransition();
  const settings = useSettingsStore();
  if (
    !useStatusStore().isPlayerExpanded ||
    playerTransitionActive.value ||
    !settings.appearance.seamlessTransition ||
    settings.reducedMotion ||
    !document.startViewTransition ||
    document.hidden ||
    coverTransitionActive.value
  ) {
    update();
    return;
  }
  let applied = false;
  /** Apply the requested layout once, including when the snapshot is cancelled. */
  const apply = (): void => {
    if (applied) return;
    applied = true;
    update();
  };
  pendingLayoutUpdate = apply;
  const active = document.startViewTransition(async () => {
    apply();
    if (pendingLayoutUpdate === apply) pendingLayoutUpdate = null;
    await nextTick();
  });
  layoutTransition = active;
  void active.ready.catch(() => {});
  void active.finished
    .finally(() => {
      if (layoutTransition === active) {
        layoutTransition = null;
        pendingLayoutUpdate = null;
      }
    })
    .catch(() => {});
};

/** Release the player snapshot and remove transient cover markers. */
export const cancelPlayerTransition = (): void => {
  const active = playerTransition.value;
  if (!active) return;
  playerTransition.value = null;
  active.skipTransition();
  for (const cover of covers) cover.removeAttribute("data-player-shared");
  covers = [];
  const root = document.documentElement;
  root.removeAttribute("data-player-transition");
  root.style.removeProperty("--player-cover-from-radius");
  root.style.removeProperty("--player-cover-to-radius");
};

/**
 * Animate a matching bar/player cover, falling back to the ordinary panel transition.
 * @param expanded - Whether to expand Now Playing.
 */
export const setPlayerExpanded = (expanded: boolean): void => {
  cancelLayoutTransition();
  cancelPlayerTransition();
  const status = useStatusStore();
  if (status.isPlayerExpanded === expanded) return;
  const settings = useSettingsStore();
  if (
    !settings.appearance.seamlessTransition ||
    settings.reducedMotion ||
    !document.startViewTransition ||
    document.hidden ||
    coverTransitionActive.value ||
    (expanded && settings.player.coverLayout === "lyrics")
  ) {
    status.isPlayerExpanded = expanded;
    return;
  }

  const source = document.querySelector<HTMLElement>(
    `[data-player-cover="${expanded ? "bar" : "full"}"]`,
  );
  const image = source?.querySelector<HTMLImageElement>(expanded ? "img[data-cover-image]" : "img");
  if (!source || !image?.complete || !image.naturalWidth || !source.checkVisibility()) {
    status.isPlayerExpanded = expanded;
    return;
  }

  const root = document.documentElement;
  source.setAttribute("data-player-shared", "");
  covers.push(source);
  root.setAttribute("data-player-transition", expanded ? "expand" : "collapse");
  root.style.setProperty("--player-cover-from-radius", getComputedStyle(source).borderRadius);
  const active = document.startViewTransition(async () => {
    if (playerTransition.value !== active) return;
    source.removeAttribute("data-player-shared");
    status.isPlayerExpanded = expanded;
    // Wait for the lazy player mount, or stop waiting when cancelled.
    if (expanded) {
      await until(() => fullPlayerReady.value || playerTransition.value !== active).toBe(true);
    }
    await nextTick();
    if (playerTransition.value !== active) return;
    const target = document.querySelector<HTMLElement>(
      `[data-player-cover="${expanded ? "full" : "bar"}"]`,
    );
    const targetImage = target?.querySelector<HTMLImageElement>("img");
    // Decode loaded thumbnails without waiting for full-resolution network artwork.
    if (targetImage && (targetImage.complete || targetImage.src === image.src)) {
      await targetImage.decode().catch(() => {});
    }
    if (playerTransition.value !== active || !target) return;
    covers.push(target);
    target.setAttribute("data-player-shared", "");
    root.style.setProperty("--player-cover-to-radius", getComputedStyle(target).borderRadius);
  });
  playerTransition.value = active;
  void active.ready.catch(() => {});
  void active.finished
    .finally(() => {
      if (playerTransition.value === active) cancelPlayerTransition();
    })
    .catch(() => {});
};
