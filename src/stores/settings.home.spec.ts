import { createApp, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import persistedState from "pinia-plugin-persistedstate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./settings";

/** Hydrate Home preferences using the real persistence plugin. */
const mountStore = () => {
  const pinia = createPinia().use(persistedState);
  createApp({}).use(pinia);
  setActivePinia(pinia);
  return useSettingsStore();
};
beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("Home statistics preference", () => {
  it("keeps statistics visible for new and older saved settings", () => {
    expect(mountStore().preset.hideHomeStats).toBe(false);
    localStorage.setItem("settings", JSON.stringify({ preset: { hideQualityTag: true } }));
    const settings = mountStore();
    expect(settings.preset.hideHomeStats).toBe(false);
    expect(settings.preset.hideQualityTag).toBe(true);
  });

  it("persists both hiding and showing statistics across store hydration", async () => {
    const settings = mountStore();
    settings.preset.hideHomeStats = true;
    await nextTick();
    expect(mountStore().preset.hideHomeStats).toBe(true);
    settings.preset.hideHomeStats = false;
    await nextTick();
    expect(mountStore().preset.hideHomeStats).toBe(false);
  });

  it("resets an invalid saved value to the visible default", () => {
    localStorage.setItem("settings", JSON.stringify({ preset: { hideHomeStats: "true" } }));
    expect(mountStore().preset.hideHomeStats).toBe(false);
  });
});

describe("player layout and lyric preferences", () => {
  it("preserves existing layout and uses compatible defaults", () => {
    localStorage.setItem("settings", JSON.stringify({ player: { coverLayout: "fullscreen" } }));
    const settings = mountStore();
    expect(settings.player.coverLayout).toBe("fullscreen");
    expect(settings.player.barLyricMode).toBe("translation");
    expect(settings.lyric.autoGenerateWordByWord).toBe(false);
  });
  it("persists AM layout and preserves older layout values", async () => {
    const settings = mountStore();
    settings.player.coverLayout = "am";
    await nextTick();
    expect(mountStore().player.coverLayout).toBe("am");
    settings.player.coverLayout = "default";
    await nextTick();
    expect(mountStore().player.coverLayout).toBe("default");
  });
  it("persists new player and lyric choices", async () => {
    const settings = mountStore();
    settings.player.coverLayout = "lyrics";
    settings.player.barLyricMode = "word";
    settings.lyric.autoGenerateWordByWord = true;
    await nextTick();
    const restored = mountStore();
    expect(restored.player.coverLayout).toBe("lyrics");
    expect(restored.player.barLyricMode).toBe("word");
    expect(restored.lyric.autoGenerateWordByWord).toBe(true);
  });
});
