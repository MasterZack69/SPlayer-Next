/* eslint-disable vue/one-component-per-file -- Dialog tests use lightweight UI fixtures. */
import { defineComponent, h, reactive } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioStreamInfo, AudioQuality, Track } from "@shared/types/player";
import en from "@/i18n/locales/en-US.json";
import zh from "@/i18n/locales/zh-CN.json";
import AudioInfoDialog from "./AudioInfoDialog.vue";

const getStreamInfo = vi.fn();
const media = reactive<{
  track: Pick<Track, "id" | "quality"> | null;
  detail: { quality: AudioQuality } | null;
}>({
  track: null,
  detail: null,
});
const status = reactive({ audioInfoOpen: true, state: "playing", outputDevices: [], speed: 1 });
const settings = {
  system: {
    player: { outputDevice: "", equalizer: { enabled: false }, loudnessNormalization: false },
  },
};
vi.mock("@/stores/media", () => ({ useMediaStore: () => media }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => status }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => settings }));

const stream: AudioStreamInfo = {
  deviceName: "Speakers",
  outputSampleRate: 48000,
  outputBits: 32,
  outputChannels: 2,
  sourceSampleRate: 44100,
  sourceBits: 16,
  isResampling: true,
  isEqualizerActive: false,
  isTempoActive: false,
  speed: 1,
  isNormalizationActive: false,
  isLimiterActive: false,
};

const Dialog = defineComponent({
  props: {
    title: String,
    titleClass: String,
    width: String,
  },
  setup(props, { slots }) {
    return () =>
      h("div", [
        h("h1", { class: props.titleClass }, props.title),
        slots.default?.(),
        slots.footer?.({ close: () => {} }),
      ]);
  },
});
const Card = defineComponent({
  setup(_, { slots }) {
    return () => h("div", { class: "card" }, slots.default?.());
  },
});

/** Mount the dialog with its actual labels and a lightweight dialog shell. */
const setup = (locale = "en-US") =>
  mount(AudioInfoDialog, {
    global: {
      plugins: [createI18n({ legacy: false, locale, messages: { "en-US": en, "zh-CN": zh } })],
      components: { SDialog: Dialog, SCard: Card },
      stubs: { SButton: true },
    },
  });

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(window, { api: { player: { getStreamInfo } } });
  media.track = {
    id: "one",
    quality: { sampleRate: 96000, bitsPerSample: 24, bitRate: 2500000, channels: 1, codec: "wav" },
  };
  media.detail = {
    quality: { sampleRate: 44100, bitsPerSample: 16, bitRate: 1658000, channels: 1, codec: "flac" },
  };
  status.audioInfoOpen = true;
  status.state = "playing";
  getStreamInfo.mockResolvedValue({ success: true, data: stream });
});

describe("audio information", () => {
  it("separates song metadata from the negotiated output stream", async () => {
    const wrapper = setup();
    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("Song Information");
    expect(wrapper.find("h1").classes()).toContain("text-sm");
    expect(wrapper.findComponent(Dialog).props("width")).toBe("min(460px, calc(100vw - 24px))");
    expect(wrapper.findAll(".card").map((card) => card.text())).toEqual([
      "Sample Rate44.1 kHz",
      "Bit Depth16 bit",
      "Bit Rate1658 kbps",
      "CodecFLAC",
    ]);
    const sections = wrapper.findAll("section");
    expect(sections[0].text()).toContain("Output Information");
    expect(sections[0].text()).toContain("Sample Rate48.0 kHz");
    expect(sections[0].text()).toContain("Bit Depth32 bit");
    expect(sections[0].text()).toContain("ChannelsStereo · 2");
    expect(sections[0].text()).toContain("ResamplingEnabled");
    expect(sections[0].text()).toContain("Output DeviceSpeakers");
    expect(sections[0].text()).not.toContain("Codec");
    expect(sections[1].text()).toContain("Audio Processing");
    wrapper.unmount();
  });

  it("shows unknown values instead of substituting song data for missing output data", async () => {
    getStreamInfo.mockResolvedValue({
      success: true,
      data: { ...stream, outputSampleRate: 0, outputBits: 0, outputChannels: 0 },
    });
    media.detail = null;
    const wrapper = setup();
    await flushPromises();
    expect(wrapper.findAll(".card").map((card) => card.text())).toEqual([
      "Sample Rate96.0 kHz",
      "Bit Depth24 bit",
      "Bit Rate2500 kbps",
      "CodecWAV",
    ]);
    const output = wrapper.findAll("section")[0].text();
    expect(output).toContain("Sample Rate--");
    expect(output).toContain("Bit Depth--");
    expect(output).toContain("Channels--");
    wrapper.unmount();
  });

  it("clears failed or stale stream responses when the track changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    getStreamInfo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    getStreamInfo.mockResolvedValueOnce({ success: false });
    const wrapper = setup();
    media.track = { ...media.track!, id: "two" };
    await flushPromises();
    resolveFirst({ success: true, data: stream });
    await flushPromises();
    expect(wrapper.findAll("section")[0].text()).toContain("Sample Rate--");
    expect(wrapper.findAll("section")[0].text()).not.toContain("48.0 kHz");
    wrapper.unmount();
  });

  it("localizes the new heading", async () => {
    const wrapper = setup("zh-CN");
    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("歌曲信息");
    wrapper.unmount();
  });
});
