import type { AlbumService } from "../../app/album-service";
import type { TimelineBucket } from "../../domain/album";
import {
  calendarDateFromLocal,
  canSearch,
  countSetCriteria,
  emptySearchCriteria,
  hasValidDateRange,
  isEmptyCriteria,
  removeSearchPerson,
  setSearchPeople,
  setTakenFrom,
  setTakenTo,
  type CalendarDate,
  type SearchCriteria,
  type SearchPerson
} from "../../domain/search";
import { getKeyCode, readArrowDirection, remoteKeys } from "../../platform/tizen/keys";
import { shortMonthNames } from "../../presentation/date-labels";
import { formatPersonName } from "../../presentation/person-labels";
import { formatSearchDate, searchPeopleRule } from "../../presentation/search-labels";
import { focusWithoutPageScroll } from "../grid-presentation";
import { createSourcedBackdrop, type BackdropSource } from "../screen-backdrop";
import {
  moveDateStepperColumn,
  openDateStepper,
  stepDateStepper,
  type DateStepperColumn,
  type DateStepperState
} from "./date-stepper";

// The Search destination (ADR 0014): a remote-first criteria panel. People
// come from the picker child screen; dates are edited with an inline stepper;
// Show photos opens the results in the shared collection. Criteria live in
// memory for the session and reset when connection settings change.

// Chips shown before "+N more"; the rest stay selected.
export const visiblePersonChipCount = 4;
// Year bounds when the library's timeline span is not known.
const fallbackYearSpan = 100;

type DateField = "from" | "to";

type SearchScreenState = {
  bounds: { earliest: CalendarDate | null; minYear: number } | null;
  boundsRequested: boolean;
  // Advanced only by reset() (a connection change). The library's span is
  // session data, so leaving Search does not discard it.
  connectionEpoch: number;
  confirmingClear: boolean;
  criteria: SearchCriteria;
  editing: { field: DateField; stepper: DateStepperState } | null;
  faceRequests: Record<string, true>;
  faces: Record<string, string>;
  focusKey: string | null;
  generation: number;
  message: string | null;
};

type SearchScreenOptions = {
  documentRef?: Document;
  // Pictures for the backdrop: random favourites.
  backdrop?: BackdropSource;
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
  const backdrop = createSourcedBackdrop(
    requireElement(documentRef, "search-backdrop") as HTMLImageElement,
    options.backdrop
  );
  const today = () => calendarDateFromLocal(options.today ? options.today() : new Date());
  const state: SearchScreenState = {
    bounds: null,
    boundsRequested: false,
    connectionEpoch: 0,
    confirmingClear: false,
    criteria: emptySearchCriteria(),
    editing: null,
    faceRequests: {},
    faces: {},
    focusKey: null,
    generation: 0,
    message: null
  };

  function defaultFocusKey(): string {
    return isEmptyCriteria(state.criteria) ? "add-people" : "show";
  }

  // The focusable controls, row by row, as they are currently rendered.
  function rows(): string[][] {
    if (state.editing) {
      return [["day", "month", "year", "clear"].map((column) => `stepper:${column}`)];
    }

    if (state.confirmingClear) {
      return [["confirm-clear", "keep"]];
    }

    const people = state.criteria.people;
    const peopleRow = ["add-people"].concat(
      people.slice(0, visiblePersonChipCount).map((person) => `chip:${person.id}`)
    );

    if (people.length > visiblePersonChipCount) {
      peopleRow.push("more");
    }

    return [
      peopleRow,
      ["from", "to"],
      isEmptyCriteria(state.criteria) ? ["show"] : ["show", "clear"]
    ];
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
    panel.appendChild(renderPeopleRow());
    panel.appendChild(renderDatesRow());

    if (state.editing) {
      panel.appendChild(renderStepper(state.editing));
    }

    panel.appendChild(renderActionsRow());

    const { message, state: messageState } = guidance();
    status.textContent = message;
    status.setAttribute("data-state", messageState);
    loadChipFaces();
  }

  function renderPeopleRow(): HTMLElement {
    const row = createRow("People");
    const controls = row.querySelector<HTMLElement>(".search-row-controls")!;
    const people = state.criteria.people;

    controls.appendChild(createControl("add-people", "+ Add people", "search-add"));

    people.slice(0, visiblePersonChipCount).forEach((person) => {
      const name = formatPersonName(person);
      const chip = createControl(`chip:${person.id}`, "", "search-chip");
      const face = documentRef.createElement("span");
      const label = documentRef.createElement("span");
      const remove = documentRef.createElement("span");

      face.className = "search-chip-face";
      face.setAttribute("aria-hidden", "true");
      face.textContent = person.name ? person.name.charAt(0).toUpperCase() : "?";

      if (state.faces[person.id]) {
        appendFaceImage(face, state.faces[person.id]!);
      }

      label.className = "search-chip-name";
      label.textContent = name;
      remove.className = "search-chip-remove";
      remove.setAttribute("aria-hidden", "true");
      remove.textContent = "×";
      chip.setAttribute("aria-label", `Remove ${name}`);
      chip.appendChild(face);
      chip.appendChild(label);
      chip.appendChild(remove);
      controls.appendChild(chip);
    });

    if (people.length > visiblePersonChipCount) {
      const more = createControl(
        "more",
        `+${people.length - visiblePersonChipCount} more`,
        "search-more"
      );
      more.setAttribute("aria-label", `${people.length} people selected. Change people`);
      controls.appendChild(more);
    }

    if (people.length > 1) {
      const rule = documentRef.createElement("p");
      rule.className = "search-rule";
      rule.textContent = searchPeopleRule;
      row.appendChild(rule);
    }

    return row;
  }

  function renderDatesRow(): HTMLElement {
    const row = createRow(null);
    const controls = row.querySelector<HTMLElement>(".search-row-controls")!;

    controls.appendChild(createDateControl("from", "Taken from", state.criteria.takenFrom));
    controls.appendChild(createDateControl("to", "Taken to", state.criteria.takenTo));

    return row;
  }

  // A Settings-style field: a small label above a normal-height control.
  function createDateControl(
    key: DateField,
    label: string,
    date: CalendarDate | null
  ): HTMLElement {
    const field = documentRef.createElement("div");
    const name = documentRef.createElement("span");
    const control = createControl(key, formatSearchDate(date), "search-date");

    field.className = "search-field";
    name.className = "field-label";
    name.textContent = label;
    control.setAttribute("aria-label", `${label}: ${formatSearchDate(date)}`);

    if (state.editing?.field === key) {
      control.setAttribute("data-editing", "true");
    }

    field.appendChild(name);
    field.appendChild(control);

    return field;
  }

  function renderStepper(editing: NonNullable<SearchScreenState["editing"]>): HTMLElement {
    const stepper = documentRef.createElement("div");
    const { date } = editing.stepper;
    const values: Record<DateStepperColumn, string> = {
      clear: "Clear",
      day: String(date.day),
      month: shortMonthNames[date.month - 1] || "",
      year: String(date.year)
    };

    stepper.className = "search-stepper";
    stepper.setAttribute("role", "group");
    stepper.setAttribute(
      "aria-label",
      editing.field === "from" ? "Edit From date" : "Edit To date"
    );

    (["day", "month", "year", "clear"] as DateStepperColumn[]).forEach((column) => {
      const control = createControl(`stepper:${column}`, values[column], "search-stepper-column");

      control.setAttribute("data-column", column);

      if (column !== "clear") {
        control.setAttribute("aria-label", `${column}: ${values[column]}. Up or Down to change`);
      } else {
        control.setAttribute("aria-label", "Clear this date to Any date");
      }

      stepper.appendChild(control);
    });

    const hint = documentRef.createElement("p");
    hint.className = "search-stepper-hint";
    hint.textContent = "Up or Down to change · OK to set · Back to cancel";
    stepper.appendChild(hint);

    return stepper;
  }

  function renderActionsRow(): HTMLElement {
    const row = documentRef.createElement("div");
    row.className = "search-row search-actions";

    const controls = documentRef.createElement("div");
    controls.className = "search-row-controls";

    if (state.confirmingClear) {
      const question = documentRef.createElement("p");
      question.className = "search-confirm";
      question.textContent = "Clear all of these choices?";
      row.appendChild(question);
      controls.appendChild(createControl("confirm-clear", "Clear all", "search-action"));
      controls.appendChild(createControl("keep", "Keep them", "search-action"));
      row.appendChild(controls);
      return row;
    }

    const show = createControl("show", "Show photos", "search-action search-show");

    if (!canSearch(state.criteria)) {
      show.setAttribute("aria-disabled", "true");
    }

    controls.appendChild(show);

    if (!isEmptyCriteria(state.criteria)) {
      controls.appendChild(createControl("clear", "Clear all", "search-action"));
    }

    row.appendChild(controls);

    return row;
  }

  // A row of controls, labelled like a Settings field when it has a label.
  function createRow(label: string | null): HTMLElement {
    const row = documentRef.createElement("div");
    const controls = documentRef.createElement("div");

    row.className = "search-row";

    if (label) {
      const heading = documentRef.createElement("span");

      heading.className = "field-label search-row-label";
      heading.textContent = label;
      row.appendChild(heading);
    }

    controls.className = "search-row-controls";
    row.appendChild(controls);

    return row;
  }

  function createControl(key: string, text: string, className: string): HTMLButtonElement {
    const control = documentRef.createElement("button");

    control.type = "button";
    control.className = `focusable ${className}`;
    control.setAttribute("data-search-control", key);
    control.textContent = text;

    return control;
  }

  function appendFaceImage(face: HTMLElement, url: string): void {
    const image = documentRef.createElement("img");

    image.alt = "";
    image.className = "search-chip-image";
    image.src = url;
    face.appendChild(image);
  }

  // Faces for the visible chips only; at most four, released with the chip.
  function loadChipFaces(): void {
    const visible = state.criteria.people.slice(0, visiblePersonChipCount);
    const visibleIds: Record<string, true> = {};

    visible.forEach((person) => (visibleIds[person.id] = true));

    Object.keys(state.faces).forEach((id) => {
      if (!visibleIds[id]) {
        options.service.revokeThumbnailUrl(state.faces[id]!);
        delete state.faces[id];
      }
    });

    const generation = state.generation;

    visible.forEach((person) => {
      if (state.faces[person.id] || state.faceRequests[person.id]) {
        return;
      }

      state.faceRequests[person.id] = true;
      options.service
        .loadPersonThumbnailUrl(person)
        .then((url) => {
          delete state.faceRequests[person.id];

          if (!url) {
            return;
          }

          const chipStillShown = state.criteria.people
            .slice(0, visiblePersonChipCount)
            .some((item) => item.id === person.id);

          if (generation !== state.generation || root.hidden || !chipStillShown) {
            options.service.revokeThumbnailUrl(url);
            return;
          }

          state.faces[person.id] = url;
          const face = panel.querySelector<HTMLElement>(
            `[data-search-control="chip:${person.id}"] .search-chip-face`
          );

          if (face) {
            appendFaceImage(face, url);
          }
        })
        .catch(() => {
          // A missing face leaves the chip's initial; the chip still works.
          delete state.faceRequests[person.id];
        });
    });
  }

  function releaseFaces(): void {
    state.generation += 1;
    Object.keys(state.faces).forEach((id) => options.service.revokeThumbnailUrl(state.faces[id]!));
    state.faces = {};
    state.faceRequests = {};
  }

  // The library's oldest photo bounds the year column and seeds From. One
  // request per session; without it, the last hundred years are offered.
  function loadBounds(): void {
    if (state.boundsRequested) {
      return;
    }

    state.boundsRequested = true;
    const epoch = state.connectionEpoch;

    options.service
      .loadTimelineBuckets("newest-first")
      .then((buckets) => {
        if (epoch === state.connectionEpoch) {
          state.bounds = readBounds(buckets);
        }
      })
      .catch(() => {
        // Fallback bounds still allow every date to be set; the next visit
        // to Search tries again.
        if (epoch === state.connectionEpoch) {
          state.boundsRequested = false;
        }
      });
  }

  function yearBounds(): { maxYear: number; minYear: number } {
    const maxYear = today().year;
    const minYear = state.bounds
      ? Math.min(state.bounds.minYear, maxYear)
      : maxYear - fallbackYearSpan;

    return { maxYear, minYear };
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

  function openStepper(field: DateField): void {
    const current = field === "from" ? state.criteria.takenFrom : state.criteria.takenTo;
    const initial =
      current ||
      (field === "to"
        ? today()
        : state.bounds?.earliest || { day: 1, month: 1, year: today().year });

    state.editing = { field, stepper: openDateStepper(initial, yearBounds()) };
    update("stepper:day");
  }

  function closeStepper(apply: boolean, value?: CalendarDate | null): void {
    const editing = state.editing;

    if (!editing) {
      return;
    }

    state.editing = null;

    if (apply) {
      const date = value === undefined ? editing.stepper.date : value;
      setCriteria(
        editing.field === "from"
          ? setTakenFrom(state.criteria, date)
          : setTakenTo(state.criteria, date)
      );
    }

    update(editing.field);
  }

  function activate(key: string): void {
    if (key === "add-people" || key === "more") {
      options.onAddPeople(state.criteria.people.slice());
      return;
    }

    if (key.indexOf("chip:") === 0) {
      removeChip(key.slice(5));
      return;
    }

    if (key === "from" || key === "to") {
      openStepper(key);
      return;
    }

    if (key === "show") {
      if (canSearch(state.criteria)) {
        options.onShowPhotos(state.criteria);
      } else if (isEmptyCriteria(state.criteria)) {
        state.message = "Choose at least one person or date first.";
        update("show");
      } else {
        update("show");
      }
      return;
    }

    if (key === "clear") {
      if (countSetCriteria(state.criteria) > 1) {
        state.confirmingClear = true;
        update("keep");
      } else {
        clearAll();
      }
      return;
    }

    if (key === "confirm-clear") {
      clearAll();
      return;
    }

    if (key === "keep") {
      state.confirmingClear = false;
      update("clear");
    }
  }

  function removeChip(id: string): void {
    const people = state.criteria.people;
    const index = people.findIndex((person) => person.id === id);

    setCriteria(removeSearchPerson(state.criteria, id));

    const remaining = state.criteria.people;
    const next = remaining[Math.min(index, remaining.length - 1)];
    const nextKey =
      next && Math.min(index, remaining.length - 1) < visiblePersonChipCount
        ? `chip:${next.id}`
        : "add-people";

    update(nextKey);
  }

  function clearAll(): void {
    state.confirmingClear = false;
    setCriteria(emptySearchCriteria());
    update("add-people");
  }

  function handleStepperKey(event: KeyboardEvent, keyCode: number): void {
    const editing = state.editing!;
    const direction = readArrowDirection(keyCode);

    event.preventDefault();

    if (keyCode === remoteKeys.back) {
      closeStepper(false);
      return;
    }

    if (keyCode === remoteKeys.enter) {
      closeStepper(true, editing.stepper.column === "clear" ? null : undefined);
      return;
    }

    if (direction === "left" || direction === "right") {
      editing.stepper = moveDateStepperColumn(editing.stepper, direction === "left" ? -1 : 1);
    } else if (direction === "up" || direction === "down") {
      editing.stepper = stepDateStepper(editing.stepper, direction === "up" ? 1 : -1);
    } else {
      return;
    }

    update(`stepper:${editing.stepper.column}`);
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

    if (state.editing) {
      handleStepperKey(event, keyCode);
      return;
    }

    if (keyCode === remoteKeys.back) {
      event.preventDefault();

      if (state.confirmingClear) {
        state.confirmingClear = false;
        update("clear");
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

    const grid = rows();
    const rowIndex = grid.findIndex((row) => key !== null && row.indexOf(key) >= 0);

    if (rowIndex < 0) {
      focusKey(defaultFocusKey());
      return;
    }

    const row = grid[rowIndex]!;
    const column = row.indexOf(key!);

    if (direction === "left") {
      if (column === 0) {
        if (!state.confirmingClear) {
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

    if (root.hidden || !target || !panel.contains(target) || state.editing) {
      return;
    }

    activate(target.getAttribute("data-search-control")!);
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  panel.addEventListener("click", handleClick);

  function hide(): void {
    root.hidden = true;
    backdrop.hide();
    state.editing = null;
    state.confirmingClear = false;
    releaseFaces();
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
      state.bounds = null;
      state.boundsRequested = false;
      state.connectionEpoch += 1;
      state.focusKey = null;
      state.message = null;
    },
    setPeople(people) {
      setCriteria(setSearchPeople(state.criteria, people));
      state.focusKey = canSearch(state.criteria) ? "show" : "add-people";
    },
    show() {
      root.hidden = false;
      backdrop.show();
      state.editing = null;
      state.confirmingClear = false;
      loadBounds();
      render();
    }
  };
}

function readBounds(buckets: TimelineBucket[]): NonNullable<SearchScreenState["bounds"]> | null {
  let earliest: CalendarDate | null = null;

  for (const bucket of buckets) {
    const match = /^(\d{4})-(\d{2})/.exec(bucket.timeBucket);

    if (!match || bucket.assetCount <= 0) {
      continue;
    }

    const date = { day: 1, month: Number(match[2]), year: Number(match[1]) };

    if (
      !earliest ||
      date.year < earliest.year ||
      (date.year === earliest.year && date.month < earliest.month)
    ) {
      earliest = date;
    }
  }

  return earliest ? { earliest, minYear: earliest.year } : null;
}

function requireElement(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}
