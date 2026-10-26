import type { AlbumService } from "../../app/album-service";
import type { SearchPlace, SearchPlaceLevel, SearchPlaceParent } from "../../domain/search";
import { toUserMessage } from "../../errors/app-error";
import { getKeyCode, readArrowDirection, remoteKeys } from "../../platform/tizen/keys";
import {
  createGridSpacer,
  focusWithoutPageScroll,
  scrollIntoContainer
} from "../grid-presentation";
import { readPlaceRows, readLetterJump, type PlaceRow } from "./place-rows";

// Search's place picker (ADR 0018): countries, then a country's regions,
// then cities, each a list of names from Immich's search suggestions. OK on
// a name goes one level down, or chooses a city; "Anywhere in …" chooses the
// level above. A level with no names is skipped. Back goes up one level, and
// from the countries returns to Search unchanged. Only the rows near focus
// exist; CH+ and CH- jump between first letters.

// Rows rendered either side of focus; the list shows about ten.
const renderedRowsAround = 14;

type PlacePickerOptions = {
  documentRef?: Document;
  onCancel(): void;
  onDone(place: SearchPlace): void;
  onReturnToShell?(): void;
  service: Pick<AlbumService, "loadPlaceSuggestions">;
};

export type PlacePickerController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  // Opens at the countries, focused on the current place's country.
  open(current: SearchPlace | null): void;
  // Forgets every loaded name, for example after connection changes.
  reset(): void;
};

type PlaceLevel = {
  focusedIndex: number;
  level: SearchPlaceLevel;
  names: string[] | null;
  parent: SearchPlaceParent;
};

type PlaceLevelState = "error" | "loading" | "ready";

export function mountPlacePicker(options: PlacePickerOptions): PlacePickerController {
  const documentRef = options.documentRef || document;
  const root = requireElement(documentRef, "search-place-screen");
  const path = requireElement(documentRef, "search-place-path");
  const retry = requireElement(documentRef, "search-place-retry");
  const status = requireElement(documentRef, "search-place-status");
  const list = requireElement(documentRef, "search-place-list");
  // The session's names per level and parent; cleared by reset().
  let cache: Record<string, string[]> = {};
  let generation = 0;
  let levels: PlaceLevel[] = [];
  let levelState: PlaceLevelState = "ready";
  let focusCountry: string | null = null;

  const current = () => levels[levels.length - 1]!;

  function rows(): PlaceRow[] {
    const level = current();

    return level.names ? readPlaceRows(level.level, level.parent, level.names) : [];
  }

  function setStatus(message: string, state: string): void {
    status.textContent = message;
    status.setAttribute("data-state", state);
  }

  function renderPath(): void {
    const { parent } = current();

    path.textContent = [parent.country, parent.state].filter((part) => part).join(" › ");
    path.hidden = !path.textContent;
  }

  function render(): void {
    const all = rows();
    const level = current();
    const start = Math.max(0, level.focusedIndex - renderedRowsAround);
    const end = Math.min(all.length, level.focusedIndex + renderedRowsAround + 1);

    list.textContent = "";

    if (start > 0) {
      list.appendChild(
        createGridSpacer(documentRef, "search-place-spacer", "--place-spacer-rows", start)
      );
    }

    for (let index = start; index < end; index += 1) {
      const row = all[index]!;
      const button = documentRef.createElement("button");

      button.type = "button";
      button.className =
        row.kind === "anywhere"
          ? "focusable search-place-row search-place-anywhere"
          : "focusable search-place-row";
      button.setAttribute("data-place-index", String(index));
      button.textContent = row.label;

      if (row.kind === "name" && level.level !== "city") {
        button.setAttribute("aria-label", `${row.label}. OK to choose within it`);
      }

      list.appendChild(button);
    }

    if (end < all.length) {
      list.appendChild(
        createGridSpacer(
          documentRef,
          "search-place-spacer",
          "--place-spacer-rows",
          all.length - end
        )
      );
    }
  }

  function focusRow(): void {
    const row = list.querySelector<HTMLElement>(`[data-place-index="${current().focusedIndex}"]`);

    if (!row) {
      (retry.hidden ? status : retry).focus();
      return;
    }

    // Chromium 63 ignores preventScroll and centres a focused row itself;
    // undo that so the list moves only as far as it must.
    const scrollTop = list.scrollTop;

    focusWithoutPageScroll(row);
    list.scrollTop = scrollTop;
    scrollIntoContainer(list, row, 12);
  }

  function cacheKey(level: SearchPlaceLevel, parent: SearchPlaceParent): string {
    return [level, parent.country || "", parent.state || ""].join("\u0000");
  }

  // Loads the current level's names, skipping a level that has none: a
  // country without regions lists its cities, and a place without anything
  // below it is chosen as it is.
  async function loadLevel(): Promise<void> {
    const level = current();
    const requestGeneration = (generation += 1);
    const key = cacheKey(level.level, level.parent);

    levelState = "loading";
    retry.hidden = true;
    list.textContent = "";
    renderPath();
    setStatus(level.level === "country" ? "Loading places..." : "Loading...", "pending");
    status.focus();

    let names = cache[key];

    if (!names) {
      try {
        names = await options.service.loadPlaceSuggestions(level.level, level.parent);
      } catch (error) {
        if (requestGeneration !== generation || root.hidden) {
          return;
        }

        levelState = "error";
        setStatus(`${toUserMessage(error)} Select Retry or press Back.`, "error");
        retry.hidden = false;
        retry.focus();
        return;
      }

      if (requestGeneration !== generation || root.hidden) {
        return;
      }

      cache[key] = names;
    }

    if (names.length === 0 && level.level !== "country") {
      skipEmptyLevel(level);
      return;
    }

    levelState = "ready";
    level.names = names;

    if (level.level === "country" && focusCountry) {
      level.focusedIndex = Math.max(0, names.indexOf(focusCountry));
      focusCountry = null;
    }

    setStatus(names.length ? "" : "No places found. Photos need location data for this.", "idle");
    render();
    focusRow();
  }

  function skipEmptyLevel(level: PlaceLevel): void {
    if (level.level === "state") {
      levels[levels.length - 1] = {
        focusedIndex: 0,
        level: "city",
        names: null,
        parent: level.parent
      };
      void loadLevel();
      return;
    }

    finish({ city: null, country: level.parent.country!, state: level.parent.state });
  }

  function finish(place: SearchPlace): void {
    generation += 1;
    options.onDone(place);
  }

  function choose(index: number): void {
    const level = current();
    const row = rows()[index];

    if (!row) {
      return;
    }

    level.focusedIndex = index;

    if (row.kind === "anywhere") {
      finish({ city: null, country: level.parent.country!, state: level.parent.state });
      return;
    }

    if (level.level === "city") {
      finish({ city: row.label, country: level.parent.country!, state: level.parent.state });
      return;
    }

    levels.push(
      level.level === "country"
        ? {
            focusedIndex: 0,
            level: "state",
            names: null,
            parent: { country: row.label, state: null }
          }
        : {
            focusedIndex: 0,
            level: "city",
            names: null,
            parent: { country: level.parent.country, state: row.label }
          }
    );
    void loadLevel();
  }

  function back(): void {
    generation += 1;

    if (levels.length <= 1) {
      options.onCancel();
      return;
    }

    levels.pop();
    void loadLevel();
  }

  function moveFocus(index: number): void {
    const count = rows().length;

    if (!count) {
      return;
    }

    current().focusedIndex = Math.max(0, Math.min(count - 1, index));
    render();
    focusRow();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (root.hidden) {
      return;
    }

    const keyCode = getKeyCode(event);

    if (keyCode === remoteKeys.back) {
      event.preventDefault();
      back();
      return;
    }

    const active = documentRef.activeElement as HTMLElement | null;

    if (!active || !root.contains(active)) {
      return;
    }

    if (keyCode === remoteKeys.enter) {
      event.preventDefault();

      if (active === retry) {
        void loadLevel();
      } else if (active.hasAttribute("data-place-index")) {
        choose(Number(active.getAttribute("data-place-index")));
      }

      return;
    }

    if (keyCode === remoteKeys.channelUp || keyCode === remoteKeys.channelDown) {
      event.preventDefault();

      if (levelState === "ready") {
        moveFocus(
          readLetterJump(
            rows(),
            current().focusedIndex,
            keyCode === remoteKeys.channelDown ? 1 : -1
          )
        );
      }

      return;
    }

    const direction = readArrowDirection(keyCode);

    if (!direction) {
      return;
    }

    event.preventDefault();

    if (direction === "left") {
      options.onReturnToShell?.();
      return;
    }

    if (!active.hasAttribute("data-place-index")) {
      if (direction === "down" && rows().length) {
        focusRow();
      }

      return;
    }

    if (direction === "up" && current().focusedIndex === 0) {
      if (!retry.hidden) {
        retry.focus();
      }

      return;
    }

    if (direction === "up" || direction === "down") {
      moveFocus(current().focusedIndex + (direction === "up" ? -1 : 1));
    }
  }

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    handleKeydown(event);

    // Choosing returns to Search, whose listener is active at once; keep
    // this press from also reaching it.
    if (event.defaultPrevented) {
      event.stopImmediatePropagation();
    }
  };
  const handleClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("button");

    if (root.hidden || !target || !root.contains(target)) {
      return;
    }

    if (target === retry) {
      void loadLevel();
    } else if (target.hasAttribute("data-place-index")) {
      choose(Number(target.getAttribute("data-place-index")));
    }
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  root.addEventListener("click", handleClick);

  function hide(): void {
    generation += 1;
    root.hidden = true;
    list.textContent = "";
  }

  return {
    destroy() {
      hide();
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      root.removeEventListener("click", handleClick);
    },
    focusContent() {
      if (levelState === "ready") {
        focusRow();
      } else {
        (retry.hidden ? status : retry).focus();
      }
    },
    hide,
    open(place) {
      root.hidden = false;
      focusCountry = place ? place.country : null;
      levels = [
        { focusedIndex: 0, level: "country", names: null, parent: { country: null, state: null } }
      ];
      void loadLevel();
    },
    reset() {
      hide();
      cache = {};
      levels = [];
    }
  };
}

function requireElement(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}
