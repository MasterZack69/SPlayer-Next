import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/i18n/locales/en-US.json";
import zh from "@/i18n/locales/zh-CN.json";

const fixture = await vi.hoisted(async () => {
  const { reactive } = await import("vue");
  return {
    library: reactive({ scanDirs: [] as string[], scanning: false, startScan: vi.fn() }),
    settings: vi.fn(),
  };
});
vi.mock("@/stores/library", () => ({ useLibraryStore: () => fixture.library }));
vi.mock("@/stores/theme", () => ({ useThemeStore: () => ({ mode: "dark", cycleMode: vi.fn() }) }));
vi.mock("@/settings/useSettingsDialog", () => ({
  useSettingsDialog: () => ({ show: fixture.settings }),
}));
vi.mock("@/composables/useWindowControls", () => ({
  useWindowControls: () => ({ isBorderless: false }),
}));
import NavHeader from "./NavHeader.vue";

const Menu = {
  name: "SDropdownMenu",
  props: ["items"],
  emits: ["select"],
  template: '<div><slot name="trigger" /></div>',
};

/** Mount the header with a captured dropdown and an isolated router. */
const mountHeader = () =>
  mount(NavHeader, {
    global: {
      plugins: [
        createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: {} }] }),
        createI18n({ legacy: false, locale: "en-US", messages: { "en-US": en } }),
      ],
      stubs: {
        SDropdownMenu: Menu,
        SButton: { template: '<button><slot name="icon"/><slot/></button>' },
        NavSearch: true,
        WindowControls: true,
        UiZoomDialog: true,
        SDivider: true,
        IconLucideChevronLeft: true,
        IconLucideChevronRight: true,
        IconLucideSettings: true,
      },
    },
  });

beforeEach(() => {
  fixture.library.scanDirs = [];
  fixture.library.scanning = false;
  vi.clearAllMocks();
});
afterEach(() => vi.clearAllMocks());

describe("quick settings full scan", () => {
  it("is disabled without directories or while scanning and starts a full scan otherwise", async () => {
    const wrapper = mountHeader();
    const menu = wrapper.findComponent(Menu);
    const item = () =>
      menu.props("items").find((entry: { key: string }) => entry.key === "fullScan");
    expect(wrapper.find('button[aria-label="Quick Settings"]').exists()).toBe(true);
    expect(item()).toMatchObject({ label: "Full Scan", disabled: true });
    menu.vm.$emit("select", "fullScan");
    expect(fixture.library.startScan).not.toHaveBeenCalled();
    fixture.library.scanDirs = ["/music"];
    await wrapper.vm.$nextTick();
    expect(item()).toMatchObject({ label: "Full Scan", disabled: false });
    menu.vm.$emit("select", "fullScan");
    expect(fixture.library.startScan).toHaveBeenCalledExactlyOnceWith(false);
    fixture.library.scanning = true;
    await wrapper.vm.$nextTick();
    expect(item()).toMatchObject({ label: "Scanning...", disabled: true });
    menu.vm.$emit("select", "fullScan");
    expect(fixture.library.startScan).toHaveBeenCalledOnce();
    menu.vm.$emit("select", "settings");
    expect(fixture.settings).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it("keeps Songs navigation, page title and scoped search labels consistent", () => {
    expect([en.nav.library, en.library.title, en.search.scope.library]).toEqual([
      "Songs",
      "Songs",
      "Search Songs…",
    ]);
    expect([zh.nav.library, zh.library.title, zh.search.scope.library]).toEqual([
      "歌曲",
      "歌曲",
      "搜索歌曲…",
    ]);
  });
});
