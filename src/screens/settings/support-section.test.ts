// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionService } from "../../app/connection-service";
import { defaultAppSettings, type AppSettings } from "../../domain/app-settings";
import { remoteKeys } from "../../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../../test/app-markup";
import { mountConnectionScreen, type ConnectionScreenController } from "../connection-screen";
import { tipPage, type SupportPage } from "./support-qr";

let controller: ConnectionScreenController | null = null;

function mount(options: { appSettings?: AppSettings; supportPage?: SupportPage | null } = {}) {
  const service: ConnectionService = {
    load: vi.fn(() => ({ apiKey: "test-key", serverUrl: "https://immich.example" })),
    save: vi.fn((settings) => settings),
    test: vi.fn()
  };
  let stored = options.appSettings || defaultAppSettings;
  const settingsStore = {
    load: vi.fn(() => stored),
    save: vi.fn((settings: AppSettings) => {
      stored = settings;
      return settings;
    })
  };
  const onBack = vi.fn();

  controller = mountConnectionScreen({
    onBack,
    service,
    settingsStore,
    supportPage: options.supportPage === undefined ? tipPage : options.supportPage
  });
  controller.show({ allowBack: true });

  return { onBack, settingsStore };
}

function railLabels(): string[] {
  return Array.prototype.map.call(
    document.querySelectorAll(".settings-nav .settings-section-button"),
    (button: HTMLElement) => button.textContent?.trim()
  ) as string[];
}

function openSupport(): void {
  controller!.focusSection("support");
  pressKey(remoteKeys.right);
}

beforeEach(() => {
  loadAppMarkup();
  byId("app-shell").hidden = false;
});

afterEach(() => {
  controller?.destroy();
  controller = null;
});

describe("Settings › Support Us", () => {
  it("puts Support Us after Ambient and before Save and Exit", () => {
    mount();

    expect(railLabels()).toEqual([
      "Connection",
      "Display",
      "Home",
      "Ambient",
      "Support Us",
      "Save",
      "Exit"
    ]);
    expect(byId("settings-section-support").querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("is reached from Ambient with Down, and Down again reaches Save", () => {
    mount();
    controller!.focusSection("ambient");

    pressKey(remoteKeys.down);
    expect(document.activeElement).toBe(byId("settings-section-support"));
    pressKey(remoteKeys.down);
    expect(document.activeElement).toBe(byId("settings-save"));
    pressKey(remoteKeys.up);
    expect(document.activeElement).toBe(byId("settings-section-support"));
  });

  it("shows the tip page, the tips and the toggle, which is the panel's only control", () => {
    mount();
    openSupport();
    const panel = byId("settings-panel-support");

    expect(panel.hidden).toBe(false);
    expect(byId("settings-section-support").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(byId("support-supporter"));
    expect(panel.querySelector("h2")?.textContent).toBe("Support Immich TV");
    expect(panel.querySelector(".support-intro")?.textContent).toBe(
      "Immich TV is free and always will be. If you enjoy it, you can buy me a coffee. Tips are optional and don't unlock anything."
    );
    expect(
      Array.prototype.map.call(panel.querySelectorAll(".support-tips li"), (item: Element) =>
        item.textContent?.trim()
      )
    ).toEqual(["£5 · A coffee", "£10 · Lunch", "£20 · Dinner"]);
    expect(panel.querySelector(".support-any")?.textContent).toBe("Any amount is appreciated.");
    expect(panel.querySelector(".support-scan")?.textContent).toBe("Scan with your phone");
    expect(panel.querySelector(".support-address")?.textContent).toBe("ko-fi.com/immichtv");
    expect(panel.querySelector(".field-label")?.textContent).toBe(
      "I've already supported Immich TV"
    );
    expect(panel.querySelectorAll(".focusable")).toHaveLength(1);
    expect(panel.querySelectorAll("a, [tabindex], iframe")).toHaveLength(0);
  });

  it("draws the QR code as hidden, crisp, unfocusable media", () => {
    mount();
    const qr = byId("settings-panel-support").querySelector("svg.support-qr")!;

    expect(qr.getAttribute("viewBox")).toBe("0 0 33 33");
    expect(qr.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(qr.getAttribute("aria-hidden")).toBe("true");
    expect(qr.getAttribute("focusable")).toBe("false");
    expect(qr.querySelector("path")?.getAttribute("d")).toBe(tipPage.qr.path);
  });

  it("keeps focus on the toggle with Up and Down, and Left returns to the rail", () => {
    mount();
    openSupport();

    pressKey(remoteKeys.down);
    expect(document.activeElement).toBe(byId("support-supporter"));
    pressKey(remoteKeys.up);
    expect(document.activeElement).toBe(byId("support-supporter"));
    pressKey(remoteKeys.left);
    expect(byId("settings-panel-support").hidden).toBe(true);
    expect(document.activeElement).toBe(byId("settings-section-support"));
  });

  it("toggles with OK, marks Settings unsaved and saves the supporter setting", () => {
    const { settingsStore } = mount();
    openSupport();
    const toggle = byId<HTMLInputElement>("support-supporter");

    expect(toggle.checked).toBe(false);
    pressKey(remoteKeys.enter);
    expect(toggle.checked).toBe(true);
    expect(byId("settings-save-label").textContent).toBe("Save *");

    pressKey(remoteKeys.enter);
    expect(toggle.checked).toBe(false);
    expect(byId("settings-save-label").textContent).toBe("Save");

    pressKey(remoteKeys.enter);
    byId("settings-save").focus();
    pressKey(remoteKeys.enter);
    expect(settingsStore.save).toHaveBeenCalledWith({ ...defaultAppSettings, supporter: true });
    expect(byId("settings-save-label").textContent).toBe("Save");
  });

  it("shows the stored choice when Settings opens", () => {
    mount({ appSettings: { ...defaultAppSettings, supporter: true } });

    expect(byId<HTMLInputElement>("support-supporter").checked).toBe(true);
  });

  it("guards leaving with an unsaved toggle, and Cancel returns to Support Us", () => {
    const { onBack, settingsStore } = mount();
    openSupport();
    pressKey(remoteKeys.enter);

    pressKey(remoteKeys.back);
    expect(byId("settings-panel-unsaved").hidden).toBe(false);
    expect(byId("settings-panel-unsaved").getAttribute("data-return-section")).toBe("support");
    expect(onBack).not.toHaveBeenCalled();

    pressKey(remoteKeys.back);
    expect(document.activeElement).toBe(byId("settings-section-support"));

    pressKey(remoteKeys.back);
    pressKey(remoteKeys.enter);
    expect(settingsStore.save).toHaveBeenCalledWith({ ...defaultAppSettings, supporter: true });
  });

  it("doesn't exist without a tip page, as in a store build", () => {
    mount({ supportPage: null });

    expect(document.getElementById("settings-section-support")).toBeNull();
    expect(document.getElementById("settings-panel-support")).toBeNull();
    expect(document.querySelector(".support-qr")).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/ko-?fi/i);
    expect(railLabels()).toEqual(["Connection", "Display", "Home", "Ambient", "Save", "Exit"]);

    controller!.focusSection("ambient");
    pressKey(remoteKeys.down);
    expect(document.activeElement).toBe(byId("settings-save"));
  });
});
