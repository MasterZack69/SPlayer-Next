import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";
import WindowControls from "@/components/layout/WindowControls.vue";
import en from "@/i18n/locales/en-US.json";
import type { DialogOptions } from "@/composables/useDialog";

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("@/composables/useDialog", () => ({ dialog: { confirm: mocks.confirm } }));
const settings = reactive({
  reducedMotion: false,
  appearance: { closeAction: "quit", rememberCloseChoice: true, fontFamily: "" },
  system: { system: { borderlessWindow: true } },
});
const route = reactive({ name: "home" });
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => settings }));
vi.mock("vue-router", () => ({ useRoute: () => route }));

const listeners = new Set<() => void>();
const quit = vi.fn();
const hide = vi.fn();
let wrapper: ReturnType<typeof mount> | undefined;

/** Mount the root listener and the actual title-bar controls together. */
const mountApp = () => {
  wrapper = mount(App, {
    global: {
      plugins: [createI18n({ legacy: false, locale: "en-US", messages: { "en-US": en } })],
      stubs: {
        AppBackground: true,
        RouterView: { components: { WindowControls }, template: "<WindowControls />" },
        SButton: { template: "<button><slot /></button>" },
      },
    },
  });
  return wrapper;
};

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  route.name = "home";
  settings.appearance.closeAction = "quit";
  settings.appearance.rememberCloseChoice = true;
  Object.assign(window, {
    api: {
      window: {
        quit,
        hide,
        minimize: vi.fn(),
        toggleMaximize: vi.fn(),
        toggleFullscreen: vi.fn(),
        isMaximized: async () => false,
        isFullscreen: async () => false,
        onMaximizeChange: () => vi.fn(),
        onFullscreenChange: () => vi.fn(),
        onCloseRequested: (callback: () => void) => {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      },
    },
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

/** Deliver the event emitted by Electron for a system window-close request. */
const systemClose = () => {
  for (const listener of listeners) listener();
};

/** Click the actual title-bar X button. */
const clickX = async () => {
  await wrapper!.findAll("button").at(-1)!.trigger("click");
};

describe("shared close behavior", () => {
  it.each(["quit", "hide"])("uses remembered %s for both Alt+F4 and X", async (action) => {
    settings.appearance.closeAction = action;
    mountApp();
    expect(listeners.size).toBe(1);
    systemClose();
    await flushPromises();
    await clickX();
    expect(action === "quit" ? quit : hide).toHaveBeenCalledTimes(2);
    expect(action === "quit" ? hide : quit).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("shows only one prompt across repeated native closes and the X button, then allows retry after cancellation", async () => {
    settings.appearance.rememberCloseChoice = false;
    let resolve!: (confirmed: boolean) => void;
    mocks.confirm.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    mountApp();
    systemClose();
    systemClose();
    await clickX();
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
    resolve(false);
    await flushPromises();
    systemClose();
    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    resolve(false);
    await flushPromises();
    expect(quit).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("remembers the selected native-close action and reuses it for X", async () => {
    settings.appearance.rememberCloseChoice = false;
    mocks.confirm.mockImplementation(async (options: DialogOptions) => {
      const body = options.body!() as import("vue").VNode;
      const children = body.children as import("vue").VNode[];
      const choices = children[0].children as import("vue").VNode[];
      choices[1].props!.onChange();
      children[1].props!["onUpdate:checked"](true);
      return true;
    });
    mountApp();
    systemClose();
    await flushPromises();
    await clickX();
    expect(settings.appearance.closeAction).toBe("hide");
    expect(settings.appearance.rememberCloseChoice).toBe(true);
    expect(hide).toHaveBeenCalledTimes(2);
    expect(quit).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it.each(["onboarding", "agreement-update"])("exits directly on %s", async (name) => {
    route.name = name;
    settings.appearance.rememberCloseChoice = false;
    mountApp();
    systemClose();
    await flushPromises();
    expect(quit).toHaveBeenCalledOnce();
    expect(hide).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("removes the native-close listener when the root unmounts", () => {
    mountApp();
    wrapper!.unmount();
    wrapper = undefined;
    expect(listeners.size).toBe(0);
    systemClose();
    expect(quit).not.toHaveBeenCalled();
  });
});
