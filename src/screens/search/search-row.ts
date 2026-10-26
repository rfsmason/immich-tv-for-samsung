import type { SearchCriteria } from "../../domain/search";

// One row of the Search panel (ADR 0014). The panel only composes rows: each
// row renders its own controls, reports its focusable controls line by line,
// handles OK on them and summarises its value. A row can hold a modal state
// (editing a date, confirming Clear all) that takes over the panel's keys
// until it ends.

export type SearchPanelContext = {
  criteria(): SearchCriteria;
  // The control focused when nothing else is: Add people with no criteria,
  // Show photos otherwise.
  defaultFocusKey(): string;
  documentRef: Document;
  isHidden(): boolean;
  setCriteria(criteria: SearchCriteria): void;
  // A message shown in the panel's guidance line until the criteria change.
  setMessage(message: string): void;
  // Re-renders the panel and focuses `key`.
  update(nextFocus: string): void;
};

export type SearchRow = {
  // OK on a control; false when the key is not this row's.
  activate(key: string): boolean;
  // Focus arriving on a control by an arrow key; true when the row handled
  // it itself (Asset type opens its list).
  arrive?(key: string): boolean;
  // Back while modal: ends the modal state and returns the key to focus.
  cancelModal?(): string;
  // Every key while modal and owning its keys (the date stepper); true when
  // handled. A modal row without it keeps arrow navigation within its lines.
  handleModalKey?(event: KeyboardEvent, keyCode: number): boolean;
  // Releases resources and ends any modal state.
  hide?(): void;
  isModal?(): boolean;
  // Focusable control keys, one list per line of controls, in order.
  lines(): string[][];
  render(): HTMLElement[];
  // Forgets session data, for example after connection settings change.
  reset?(): void;
  show?(): void;
  // The row's value in a few words, or null when it is not set.
  summary(): string | null;
};

// A row of controls, labelled like a Settings field when it has a label.
export function createSearchRow(
  documentRef: Document,
  label: string | null
): { controls: HTMLElement; row: HTMLElement } {
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

  return { controls, row };
}

export function createSearchControl(
  documentRef: Document,
  key: string,
  text: string,
  className: string
): HTMLButtonElement {
  const control = documentRef.createElement("button");

  control.type = "button";
  control.className = `focusable ${className}`;
  control.setAttribute("data-search-control", key);
  control.textContent = text;

  return control;
}

// A chosen value as a chip that OK removes: its name and a × mark.
export function createRemovableChip(
  documentRef: Document,
  key: string,
  name: string,
  className = ""
): HTMLButtonElement {
  const chip = createSearchControl(
    documentRef,
    key,
    "",
    `search-chip search-chip-text ${className}`.trim()
  );
  const label = documentRef.createElement("span");
  const remove = documentRef.createElement("span");

  label.className = "search-chip-name";
  label.textContent = name;
  remove.className = "search-chip-remove";
  remove.setAttribute("aria-hidden", "true");
  remove.textContent = "×";
  chip.setAttribute("aria-label", `Remove ${name}`);
  chip.appendChild(label);
  chip.appendChild(remove);

  return chip;
}
