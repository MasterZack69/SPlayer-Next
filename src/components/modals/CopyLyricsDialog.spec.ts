import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en-US.json";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  poster: vi.fn(),
}));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => ({ appearance: {}, lyric: {} }) }));
vi.mock("@/stores/media", () => ({
  useMediaStore: () => ({
    track: { title: "Song", artists: [{ name: "Artist" }] },
    parsedLyric: [{ words: [{ word: "Line" }], isBG: false }],
  }),
}));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({ coverColor: "#000" }) }));
vi.mock("@/composables/useCopyText", () => ({ useCopyText: () => ({ copy: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({
  toast: { success: mocks.success, error: mocks.error, warning: vi.fn() },
}));
vi.mock("@/utils/lyric/poster", () => ({ createLyricPoster: mocks.poster }));
import CopyLyricsDialog from "./CopyLyricsDialog.vue";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("lyric image export", () => {
  it("treats cancellation quietly and reports actual success and errors", async () => {
    mocks.poster.mockResolvedValue({ arrayBuffer: async () => new Uint8Array([1]).buffer });
    vi.stubGlobal("api", undefined);
    Object.assign(window, { api: { system: { saveFile: mocks.save } } });
    const wrapper = mount(CopyLyricsDialog, {
      props: { open: false },
      global: {
        plugins: [createI18n({ legacy: false, locale: "en-US", messages: { "en-US": en } })],
        stubs: {
          SDialog: { template: '<div><slot/><slot name="footer"/></div>' },
          SButton: { template: "<button @click=\"$emit('click')\"><slot/></button>" },
          SCheckbox: true,
          SCheckboxGroup: true,
        },
      },
    });
    await wrapper.setProps({ open: true });
    const button = wrapper.findAll("button").find((item) => item.text() === "Export image")!;
    mocks.save.mockResolvedValueOnce({ success: false, canceled: true });
    await button.trigger("click");
    await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "Song - Artist - Lyrics.png",
      "Save lyric image",
    );
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    mocks.save.mockResolvedValueOnce({ success: true, path: "/tmp/image.png" });
    await button.trigger("click");
    await flushPromises();
    expect(mocks.success).toHaveBeenCalledOnce();
    mocks.save.mockResolvedValueOnce({ success: false, error: "disk full" });
    await button.trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
});
