import { describe, expect, it } from "vitest";
import {
  getNextRailDestination,
  getSettingsBackDestination,
  getTopLevelDestinationByOffset,
  isTopLevelDestinationId,
  resolveContentFocusController,
  shouldAllowDestinationActivation,
  type ShellScreenController
} from "./app-shell";

describe("application shell navigation", () => {
  it("moves through top-level destinations in rail order", () => {
    expect(getTopLevelDestinationByOffset("home", 1)).toBe("photos");
    expect(getTopLevelDestinationByOffset("photos", 1)).toBe("albums");
    expect(getTopLevelDestinationByOffset("settings", 1)).toBe("settings");
    expect(getTopLevelDestinationByOffset("home", -1)).toBe("home");
  });

  it("returns settings to the previous top-level destination with albums as fallback", () => {
    expect(getSettingsBackDestination("photos")).toBe("photos");
    expect(getSettingsBackDestination("settings")).toBe("albums");
    expect(getSettingsBackDestination(null)).toBe("albums");
  });

  it("moves the rail from the active destination even if focus was stolen by content", () => {
    expect(
      getNextRailDestination({
        activeDestination: "albums",
        focusedDestination: "photos",
        offset: 1
      })
    ).toBe("search");
  });

  it("recognizes supported top-level destination ids", () => {
    expect(isTopLevelDestinationId("albums")).toBe(true);
    expect(isTopLevelDestinationId("people")).toBe(false);
    expect(isTopLevelDestinationId(null)).toBe(false);
  });

  it("lets settings veto top-level rail navigation while unsaved changes are pending", () => {
    const activationAttempts: string[] = [];
    const isAllowed = shouldAllowDestinationActivation({
      activeDestination: "settings",
      destination: "albums",
      onBeforeDestinationActivated(fromDestination, toDestination) {
        activationAttempts.push(`${fromDestination}->${toDestination}`);
        return false;
      }
    });

    expect(isAllowed).toBe(false);
    expect(activationAttempts).toEqual(["settings->albums"]);
  });

  it("allows deliberate settings exits to bypass the rail navigation guard", () => {
    const isAllowed = shouldAllowDestinationActivation({
      activeDestination: "settings",
      bypassGuard: true,
      destination: "albums",
      onBeforeDestinationActivated() {
        return false;
      }
    });

    expect(isAllowed).toBe(true);
  });

  it("returns compact rail focus to album detail content when album detail owns visible content", () => {
    const albumsController = createScreenController();
    const albumDetailController = createScreenController();
    const resolvedController = resolveContentFocusController({
      activeDestination: "albums",
      contentFocusController: albumDetailController,
      screens: {
        albums: albumsController,
        home: createScreenController(),
        photos: createScreenController(),
        search: createScreenController(),
        settings: createScreenController()
      }
    });

    expect(resolvedController).toBe(albumDetailController);
    expect(resolvedController).not.toBe(albumsController);
  });
});

function createScreenController(): ShellScreenController {
  return {
    focusContent() {
      return undefined;
    },
    hide() {
      return undefined;
    },
    show() {
      return undefined;
    }
  };
}
