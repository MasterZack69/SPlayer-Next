import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SSlider from "./SSlider.vue";

describe("seek transition glow", () => {
  it("hides the thumb only while glowing and restores normal controls afterward", async () => {
    const wrapper = mount(SSlider, { props: { modelValue: 40, showPopover: false } });
    expect(wrapper.classes()).not.toContain("s-slider--glow");
    expect(wrapper.get(".s-slider-thumb").classes()).toContain("opacity-100");
    await wrapper.setProps({ glow: true });
    expect(wrapper.classes()).toContain("s-slider--glow");
    expect(wrapper.get(".s-slider-thumb").classes()).toContain("opacity-0");
    await wrapper.setProps({ glow: false });
    expect(wrapper.get(".s-slider-thumb").classes()).toContain("opacity-100");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });
});

describe("expanding accessible slider", () => {
  it("expands on hover, retains its hitbox, and hides the thumb", async () => {
    const wrapper = mount(SSlider, {
      props: {
        modelValue: 40,
        trackHeight: 8,
        hoverTrackHeight: 20,
        thumbSize: 14,
        hideThumb: true,
        label: "Volume",
      },
    });
    expect(wrapper.get(".s-slider-hitbox").attributes("style")).toContain("height: 20px");
    expect(wrapper.get(".s-slider-track").attributes("style")).toContain("height: 8px");
    expect(wrapper.get(".s-slider-thumb").classes()).toContain("opacity-0");
    await wrapper.trigger("mouseenter");
    expect(wrapper.get(".s-slider-track").attributes("style")).toContain("height: 20px");
    await wrapper.trigger("mouseleave");
    expect(wrapper.get(".s-slider-track").attributes("style")).toContain("height: 8px");
    wrapper.unmount();
  });
  it("restores a cancelled labelled drag without committing a seek", async () => {
    const wrapper = mount(SSlider, { props: { modelValue: 40, label: "Position" } });
    const hitbox = wrapper.get(".s-slider-hitbox");
    Object.defineProperty(hitbox.element, "setPointerCapture", { value: () => {} });
    hitbox.element.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 100,
      height: 20,
      right: 100,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    await hitbox.trigger("pointerdown", { clientX: 70, pointerId: 1 });
    await hitbox.trigger("pointercancel", { pointerId: 1 });
    expect(wrapper.emitted("dragEnd")).toBeUndefined();
    expect(wrapper.emitted("change")?.at(-1)).toEqual([40]);
    wrapper.unmount();
  });
  it("adjusts labelled sliders with keys and commits seek events", async () => {
    const wrapper = mount(SSlider, {
      props: { modelValue: 40, min: 0, max: 100, step: 10, label: "Position" },
    });
    expect(wrapper.attributes("role")).toBe("slider");
    await wrapper.trigger("keydown", { key: "ArrowRight" });
    expect(wrapper.emitted("change")?.[0]).toEqual([50]);
    expect(wrapper.emitted("dragEnd")?.[0]).toEqual([50]);
    await wrapper.trigger("keydown", { key: "End" });
    expect(wrapper.emitted("dragEnd")?.[1]).toEqual([100]);
    await wrapper.setProps({ disabled: true });
    await wrapper.trigger("keydown", { key: "Home" });
    expect(wrapper.emitted("dragEnd")).toHaveLength(2);
    wrapper.unmount();
  });
});
