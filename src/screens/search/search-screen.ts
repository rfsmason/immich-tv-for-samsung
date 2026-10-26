import type { AlbumService } from "../../app/album-service";
import {
  calendarDateFromLocal,
  canSearch,
  emptySearchCriteria,
  hasValidDateRange,
  isEmptyCriteria,
  setSearchPeople,
  type SearchCriteria,
  type SearchPerson
} from "../../domain/search";
import { getKeyCode, readArrowDirection, remoteKeys } from "../../platform/tizen/keys";
import { focusWithoutPageScroll } from "../grid-presentation";
import { createActionsRow } from "./actions-row";
import { createDatesRow } from "./dates-row";
import { createPeopleRow } from "./people-row";
import type { SearchPanelContext, SearchRow } from "./search-row";

export { visiblePersonChipCount } from "./people-row";

// The Search destination (ADR 0014): a remote-first criteria panel. The panel
// composes its rows (search-row.ts); people come from the picker child
// screen, dates are edited with an inline stepper, and Show photos opens the
// results in the shared collection. Criteria live in memory for the session
// and reset when connection settings change.

type SearchScreenState = {
  criteria: SearchCriteria;
  focusKey: string | null;
  message: string | null;
};

type SearchScreenOptions = {
  documentRef?: Document;
  onAddPeople(people: SearchPerson[]): void;
  onReturnToShell(): void;
  onShowPhotos(criteria: SearchCriteria): void;
  service: Pick<
    AlbumService,
    "loadPersonThumbnailUrl" | "loadTimelineBuckets" | "revokeThumbnailUrl"
  >;
  today?(): Date;
};

export type SearchScreenController = {
  criteria(): SearchCriteria;
  destroy(): void;
  focusContent(): void;
  // Returning from results lands on the control that opened them.
  focusShowPhotos(): void;
  hide(): void;
  // Forgets every criterion, for example after connection settings change.
  reset(): void;
  // Applies the picker's selection.
  setPeople(people: SearchPerson[]): void;
  show(): void;
};

export function mountSearchScreen(options: SearchScreenOptions): SearchScreenController {
  const documentRef = options.documentRef || document;
  const root = requireElement(documentRef, "search-screen");
  const panel = requireElement(documentRef, "search-panel");
  const status = requireElement(documentRef, "search-message");
  const state: SearchScreenState = {
    criteria: emptySearchCriteria(),
    focusKey: null,
    message: null
  };
  const context: SearchPanelContext = {
    criteria: () => state.criteria,
    defaultFocusKey,
    documentRef,
    isHidden: () => root.hidden,
    setCriteria,
    setMessage(message) {
      state.message = message;
    },
    update
  };
  const searchRows: SearchRow[] = [
    createPeopleRow(context, { onAddPeople: options.onAddPeople, service: options.service }),
    createDatesRow(context, {
      service: options.service,
      today: () => calendarDateFromLocal(options.today ? options.today() : new Date())
    }),
    createActionsRow(context, { onShowPhotos: options.onShowPhotos })
  ];

  function defaultFocusKey(): string {
    return isEmptyCriteria(state.criteria) ? "add-people" : "show";
  }

  function modalRow(): SearchRow | null {
    return searchRows.filter((row) => row.isModal?.())[0] || null;
  }

  // The focusable controls, line by line, as they are currently rendered.
  // A modal row's own lines are the only ones while it lasts.
  function lines(): string[][] {
    const modal = modalRow();

    if (modal) {
      return modal.lines();
    }

    return searchRows.reduce<string[][]>((all, row) => all.concat(row.lines()), []);
  }

  function guidance(): { message: string; state: string } {
    if (state.message) {
      return { message: state.message, state: "error" };
    }

    if (!hasValidDateRange(state.criteria)) {
      return { message: "From must be on or before To.", state: "error" };
    }

    if (isEmptyCriteria(state.criteria)) {
      return {
        message:
          "Choose people, dates, or both, then Show photos. To browse everything, use Photos.",
        state: "idle"
      };
    }

    return { message: "", state: "idle" };
  }

  function render(): void {
    panel.textContent = "";
    searchRows.forEach((row) => row.render().forEach((element) => panel.appendChild(element)));

    const { message, state: messageState } = guidance();
    status.textContent = message;
    status.setAttribute("data-state", messageState);
  }

  function focusKey(key: string): void {
    const control =
      panel.querySelector<HTMLElement>(`[data-search-control="${key}"]`) ||
      panel.querySelector<HTMLElement>(`[data-search-control="${defaultFocusKey()}"]`);

    state.focusKey = control?.getAttribute("data-search-control") || null;

    if (control) {
      focusWithoutPageScroll(control);
    }
  }

  function update(nextFocus: string): void {
    render();
    focusKey(nextFocus);
  }

  function setCriteria(criteria: SearchCriteria): void {
    state.criteria = criteria;
    state.message = null;
  }

  function activate(key: string): void {
    searchRows.some((row) => row.activate(key));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (root.hidden) {
      return;
    }

    const active = documentRef.activeElement as HTMLElement | null;

    if (!active || !root.contains(active)) {
      return;
    }

    const keyCode = getKeyCode(event);
    const modal = modalRow();

    if (modal?.handleModalKey) {
      modal.handleModalKey(event, keyCode);
      return;
    }

    if (keyCode === remoteKeys.back) {
      event.preventDefault();

      if (modal?.cancelModal) {
        update(modal.cancelModal());
      } else {
        options.onReturnToShell();
      }

      return;
    }

    const key = active.getAttribute("data-search-control");

    if (keyCode === remoteKeys.enter) {
      event.preventDefault();

      if (key) {
        activate(key);
      }

      return;
    }

    const direction = readArrowDirection(keyCode);

    if (!direction) {
      return;
    }

    event.preventDefault();

    const grid = lines();
    const rowIndex = grid.findIndex((row) => key !== null && row.indexOf(key) >= 0);

    if (rowIndex < 0) {
      focusKey(defaultFocusKey());
      return;
    }

    const row = grid[rowIndex]!;
    const column = row.indexOf(key!);

    if (direction === "left") {
      if (column === 0) {
        if (!modal) {
          options.onReturnToShell();
        }
      } else {
        focusKey(row[column - 1]!);
      }
      return;
    }

    if (direction === "right") {
      if (column < row.length - 1) {
        focusKey(row[column + 1]!);
      }
      return;
    }

    const target = grid[rowIndex + (direction === "up" ? -1 : 1)];

    if (target) {
      focusKey(target[Math.min(column, target.length - 1)]!);
    }
  }

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    handleKeydown(event);

    // Opening the picker or results makes another screen's listener active
    // at once; keep this press from also reaching it.
    if (event.defaultPrevented) {
      event.stopImmediatePropagation();
    }
  };
  const handleClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-search-control]");
    const modal = modalRow();

    if (root.hidden || !target || !panel.contains(target) || modal?.handleModalKey) {
      return;
    }

    activate(target.getAttribute("data-search-control")!);
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  panel.addEventListener("click", handleClick);

  function hide(): void {
    root.hidden = true;
    searchRows.forEach((row) => row.hide?.());
    panel.textContent = "";
  }

  return {
    criteria: () => state.criteria,
    destroy() {
      hide();
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      panel.removeEventListener("click", handleClick);
    },
    focusContent() {
      focusKey(state.focusKey || defaultFocusKey());
    },
    focusShowPhotos() {
      focusKey("show");
    },
    hide,
    reset() {
      hide();
      state.criteria = emptySearchCriteria();
      state.focusKey = null;
      state.message = null;
      searchRows.forEach((row) => row.reset?.());
    },
    setPeople(people) {
      setCriteria(setSearchPeople(state.criteria, people));
      state.focusKey = canSearch(state.criteria) ? "show" : "add-people";
    },
    show() {
      root.hidden = false;
      searchRows.forEach((row) => row.show?.());
      render();
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
