import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  save: vi.fn(),
  write: vi.fn(),
  error: vi.fn(),
  window: null as object | null,
}));
vi.mock("electron", () => ({
  app: { getPath: () => "/downloads" },
  clipboard: {},
  ClipboardItem: vi.fn(),
  shell: {},
  dialog: { showSaveDialog: mocks.save },
  ipcMain: {
    on: vi.fn(),
    handle: (name: string, callback: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(name, callback),
  },
}));
vi.mock("node:fs/promises", () => ({ stat: vi.fn(), writeFile: mocks.write }));
vi.mock("font-list", () => ({ getFonts: vi.fn() }));
vi.mock("@main/utils/i18n", () => ({ setLocale: vi.fn() }));
vi.mock("@main/utils/logger", () => ({ systemLog: { error: mocks.error } }));
vi.mock("@main/services/tray", () => ({ refreshTray: vi.fn() }));
vi.mock("@main/window", () => ({ getMainWindow: () => mocks.window, focusMainWindow: vi.fn() }));
vi.mock("@main/utils/fetchBytes", () => ({ fetchBytes: vi.fn() }));
vi.mock("@main/utils/paths", () => ({ logsDir: "" }));
vi.mock("@main/services/orpheus", () => ({ consumePendingOrpheusUrl: vi.fn() }));
vi.mock("@main/services/externalFile", () => ({ consumePendingAudioFiles: vi.fn() }));
vi.mock("@main/store", () => ({ store: {} }));
import { registerSystemIpc } from "./system";

/** Invoke the registered save endpoint with test bytes. */
const save = (name = "song.png") =>
  mocks.handlers.get("system:saveFile")!(null, new Uint8Array([1, 2]).buffer, name, "Save image");

describe("lyric image save dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    mocks.window = null;
    mocks.write.mockResolvedValue(undefined);
    registerSystemIpc();
  });
  it("offers a sanitized default name and writes to the selected path", async () => {
    mocks.window = { id: 1 };
    mocks.save.mockResolvedValue({ canceled: false, filePath: "/chosen/image.png" });
    expect(await save("../song?.png")).toEqual({ success: true, path: "/chosen/image.png" });
    expect(mocks.save).toHaveBeenCalledWith(mocks.window, {
      title: "Save image",
      defaultPath: "/downloads/song .png",
      properties: ["showOverwriteConfirmation"],
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    expect(mocks.write).toHaveBeenCalledWith("/chosen/image.png", Buffer.from([1, 2]));
  });
  it("does not write or report an error when canceled", async () => {
    mocks.save.mockResolvedValue({ canceled: true });
    expect(await save()).toEqual({ success: false, canceled: true });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it("reports invalid names and write failures", async () => {
    expect(await save(".. ")).toMatchObject({ success: false, error: "invalid file name" });
    mocks.save.mockResolvedValue({ canceled: false, filePath: "/chosen/image.png" });
    mocks.write.mockRejectedValue(new Error("disk full"));
    expect(await save()).toMatchObject({ success: false, error: "Error: disk full" });
  });
});
