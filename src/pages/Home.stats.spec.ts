import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, onUnmounted, watch } from "vue";
import en from "@/i18n/locales/en-US.json";

const state = await vi.hoisted(async () => {
  const { reactive } = await import("vue");
  return {
    settings: reactive({ preset: { hideHomeStats: false } }),
    library: reactive({ tracks: [] as unknown[] }),
    statsLoad: vi.fn(),
    statsDispose: vi.fn(),
  };
});
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => state.settings }));
vi.mock("@/stores/library", () => ({ useLibraryStore: () => state.library }));
vi.mock("@/composables/home/useHomeHeader", () => ({
  useHomeHeader: () => ({ greetingTitle: "Good morning", headerStats: [], load: vi.fn() }),
}));
vi.mock("@/composables/home/useDailyRecommend", () => ({
  useDailyRecommend: () => ({
    hero: null,
    loading: false,
    previewTracks: [],
    load: vi.fn(),
  }),
}));
vi.mock("@/composables/useFloatingPlayerBar", () => ({
  useFloatingPlayerBar: () => ({ isFloatingBar: false }),
}));
vi.mock("@/components/stats/HomeStats.vue", () => ({
  default: { name: "HomeStats", template: "<section />" },
}));
import Home from "./Home.vue";

const StatsProbe = defineComponent({
  setup() {
    watch(() => state.library.tracks, state.statsLoad, { immediate: true });
    onUnmounted(state.statsDispose);
    return () => h("section", { "data-home-stats": "" }, "Stats");
  },
});
let wrapper: VueWrapper;
/** Render Home with a statistics lifecycle probe instead of IPC-backed charts. */
const mountHome = () => {
  wrapper = mount(Home, {
    global: {
      plugins: [createI18n({ legacy: false, locale: "en-US", messages: { "en-US": en } })],
      stubs: {
        HomeStats: StatsProbe,
        SCard: true,
        SLoading: true,
        SImg: true,
        STag: true,
        SButton: true,
        IconLucidePlay: true,
        IconLucidePlus: true,
      },
    },
  });
};
beforeEach(() => {
  vi.clearAllMocks();
  state.settings.preset.hideHomeStats = false;
});
afterEach(() => wrapper?.unmount());

describe("Home statistics visibility", () => {
  it("shows statistics by default and unmounts them immediately when hidden", async () => {
    mountHome();
    expect(wrapper.find("[data-home-stats]").exists()).toBe(true);
    expect(state.statsLoad).toHaveBeenCalledOnce();
    state.settings.preset.hideHomeStats = true;
    await nextTick();
    expect(wrapper.find("[data-home-stats]").exists()).toBe(false);
    expect(state.statsDispose).toHaveBeenCalledOnce();
    state.library.tracks = [{ id: "new" }];
    await nextTick();
    expect(state.statsLoad).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("Good morning");
    state.settings.preset.hideHomeStats = false;
    await nextTick();
    expect(wrapper.find("[data-home-stats]").exists()).toBe(true);
    expect(state.statsLoad).toHaveBeenCalledTimes(2);
  });

  it("does not initialize the statistics component when already hidden", () => {
    state.settings.preset.hideHomeStats = true;
    mountHome();
    expect(wrapper.find("[data-home-stats]").exists()).toBe(false);
    expect(state.statsLoad).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Good morning");
  });
});
