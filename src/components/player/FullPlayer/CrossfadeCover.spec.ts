import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrossfadeCover from "./CrossfadeCover.vue";

const DetailCover = {
  name: "DetailCover",
  props: ["src", "fallback"],
  emits: ["ready"],
  template: '<div class="detail" :data-src="src" />',
};

describe("decoded artwork crossfade", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    document.documentElement.removeAttribute("data-reduced-motion");
    vi.useRealTimers();
  });
  it("keeps the old cover until the latest one is ready, bounding and releasing layers", async () => {
    const wrapper = mount(CrossfadeCover, {
      props: { identity: "a", src: "a", active: true },
      global: { stubs: { DetailCover } },
    });
    await wrapper.setProps({ identity: "b", src: "b" });
    let covers = wrapper.findAllComponents(DetailCover);
    expect(covers).toHaveLength(2);
    expect(covers[0]!.attributes("style")).toContain("opacity: 1");
    expect(covers[1]!.attributes("style")).toContain("opacity: 0");
    await wrapper.setProps({ identity: "c", src: "c" });
    covers = wrapper.findAllComponents(DetailCover);
    expect(covers.map((item) => item.attributes("data-src"))).toEqual(["a", "c"]);
    covers[1]!.vm.$emit("ready");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAllComponents(DetailCover).map((item) => item.attributes("style"))).toEqual([
      "opacity: 0;",
      "opacity: 1;",
    ]);
    await vi.advanceTimersByTimeAsync(500);
    expect(
      wrapper.findAllComponents(DetailCover).map((item) => item.attributes("data-src")),
    ).toEqual(["c"]);
    wrapper.unmount();
  });
  it("uses one layer when hidden or reduced motion is requested", async () => {
    const wrapper = mount(CrossfadeCover, {
      props: { identity: "a", src: "a", active: true },
      global: { stubs: { DetailCover } },
    });
    await wrapper.setProps({ identity: "b", src: "b" });
    await wrapper.setProps({ active: false });
    expect(wrapper.findAllComponents(DetailCover)).toHaveLength(1);
    document.documentElement.setAttribute("data-reduced-motion", "");
    await wrapper.setProps({ active: true, identity: "c", src: "c" });
    expect(wrapper.findAllComponents(DetailCover)).toHaveLength(1);
    wrapper.unmount();
  });
});
