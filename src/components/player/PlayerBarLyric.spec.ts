import { mount } from "@vue/test-utils";
import { nextTick, reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerBarLyric from "./PlayerBarLyric.vue";

const state = reactive({
  isPlaying: true,
  isPlayerExpanded: false,
  lyricOffsetMs: 0,
  position: 2000,
});
const settings = reactive({ player: { showLyricInBar: true, barLyricMode: "translation" } });
const media = reactive({
  lyricIndex: 0,
  lyricFormat: "lrc",
  parsedLyric: [
    {
      startTime: 1000,
      endTime: 5000,
      isBG: false,
      isDuet: false,
      translatedLyric: "Translated",
      romanLyric: "",
      words: [
        { word: "Hi ", startTime: 1000, endTime: 3000 },
        { word: "there", startTime: 3000, endTime: 5000 },
      ],
    },
  ],
});
const visibility = ref("visible");
vi.mock("@/stores/status", () => ({ useStatusStore: () => state }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => settings }));
vi.mock("@/stores/media", () => ({ useMediaStore: () => media }));
vi.mock("@vueuse/core", async (original) => ({
  ...(await original<typeof import("@vueuse/core")>()),
  useDocumentVisibility: () => visibility,
}));
beforeEach(() => {
  state.isPlaying = true;
  state.isPlayerExpanded = false;
  settings.player.showLyricInBar = true;
  settings.player.barLyricMode = "translation";
  visibility.value = "visible";
});

describe("player bar lyrics", () => {
  it("switches between translation, original and word highlighting", async () => {
    const wrapper = mount(PlayerBarLyric, { slots: { default: "Artist" } });
    expect(wrapper.text()).toContain("Hi there（Translated）");
    settings.player.barLyricMode = "lyric";
    await nextTick();
    expect(wrapper.text()).toBe("Hi there");
    settings.player.barLyricMode = "word";
    await nextTick();
    expect(wrapper.findAll(".bar-word")).toHaveLength(2);
    expect(wrapper.find(".bar-word").attributes("style")).toContain("--progress");
    visibility.value = "hidden";
    await nextTick();
    expect(wrapper.find(".bar-word").attributes("style")).toContain("--progress: 1");
    settings.player.showLyricInBar = false;
    await nextTick();
    expect(wrapper.text()).toBe("Artist");
    wrapper.unmount();
  });
});
