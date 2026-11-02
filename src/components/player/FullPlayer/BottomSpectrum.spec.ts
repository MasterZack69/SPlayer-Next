import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import BottomSpectrum from "./BottomSpectrum.vue";
const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
  resume: vi.fn(),
  pause: vi.fn(),
}));
const visibility = ref("visible");
vi.mock("@vueuse/core", async (original) => ({
  ...(await original<typeof import("@vueuse/core")>()),
  useDocumentVisibility: () => visibility,
  useRafFn: () => ({ resume: mocks.resume, pause: mocks.pause }),
}));
vi.mock("@/stores/status", () => ({ useStatusStore: () => ({ isPlaying: true }) }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => ({ player: {} }) }));
vi.mock("@/services/fftCapture", () => ({ acquireFft: mocks.acquire, releaseFft: mocks.release }));
vi.mock("@/services/playback", () => ({ getFftFrame: () => [[], []] }));
describe("spectrum visibility", () => {
  it("releases capture while hidden and reacquires it only when visible", async () => {
    const wrapper = mount(BottomSpectrum);
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
    visibility.value = "hidden";
    await nextTick();
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.pause).toHaveBeenCalled();
    visibility.value = "visible";
    await nextTick();
    expect(mocks.acquire).toHaveBeenCalledTimes(2);
    wrapper.unmount();
    expect(mocks.release).toHaveBeenCalledTimes(2);
  });
});
