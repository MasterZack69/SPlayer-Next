import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LyricLine } from "@shared/types/lyrics";
import { useMediaStore } from "./media";

const settings = reactive({
  locale: "en-US",
  lyric: {
    detectBackgroundLyrics: true,
    cjkTransform: "s2t",
    autoGenerateWordByWord: false,
    enableExcludeLyrics: false,
  },
});
const mock = vi.hoisted(() => ({ convert: vi.fn() }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => settings }));
vi.mock("@/services/lyric/loader", () => ({ watchLyricPreference: vi.fn() }));
vi.mock("@/utils/lyric/cjkTransform", () => ({ applyLyricCjkTransform: mock.convert }));

beforeEach(() => {
  setActivePinia(createPinia());
  settings.lyric.cjkTransform = "s2t";
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { nowPlaying: { update: vi.fn() } },
  });
  mock.convert.mockReset();
});

describe("lyric transform cancellation", () => {
  it.each(["clear", "resetLyricState", "replacement"] as const)(
    "ignores a pending conversion after %s",
    async (operation) => {
      let finish!: (lines: LyricLine[]) => void;
      mock.convert.mockReturnValue(
        new Promise<LyricLine[]>((resolve) => {
          finish = resolve;
        }),
      );
      const media = useMediaStore();
      media.setLyric({ source: "external", format: "lrc" }, { content: "[00:01.00]Old" });
      const old = media.parsedLyric;
      if (operation === "replacement") {
        settings.lyric.cjkTransform = "none";
        media.setLyric({ source: "external", format: "lrc" }, { content: "[00:01.00]New" });
      } else media[operation]();
      finish(old);
      await Promise.resolve();
      expect(media.parsedLyric.map((line) => line.words.map((word) => word.word).join(""))).toEqual(
        operation === "replacement" ? ["New"] : [],
      );
    },
  );
});
