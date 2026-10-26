import { readArrowDirection, remoteKeys } from "../platform/tizen/keys";

// The app's drop-down field, shared by Search's Asset type and Settings'
// slideshow interval so both behave alike on the remote:
// - focus moves onto the field like any other control; OK opens its list on
//   the current value;
// - Up and Down move through the list;
// - OK chooses and closes it, leaving focus on the field;
// - Back closes it unchanged;
// - Left, Right, or moving past either end also close it unchanged, so the
//   list never traps focus;
// - closed, arrows move on as usual and OK opens it again.
// The list drops down over what lies beneath, so opening it moves nothing.
// This module holds the state and builds the pieces; each screen places them
// and moves focus with its own navigation.

export type DropdownKey = "back" | "down" | "enter" | "left" | "right" | "up";

export type DropdownKeyResult =
  // Focus this option; the list stays open.
  | { focus: number }
  // The list closed, choosing this option when set.
  | { chosen?: number; closed: true };

export type DropdownState = {
  close(): void;
  handleKey(key: DropdownKey): DropdownKeyResult;
  // The focused option while open, otherwise null.
  highlighted(): number | null;
  isOpen(): boolean;
  // Opens on `current`; returns the option to focus.
  open(current: number): number;
};

export function createDropdownState(optionCount: number): DropdownState {
  let highlighted: number | null = null;

  return {
    close() {
      highlighted = null;
    },
    handleKey(key) {
      const index = highlighted ?? 0;

      if (key === "enter") {
        highlighted = null;
        return { chosen: index, closed: true };
      }

      if (key === "up" && index > 0) {
        highlighted = index - 1;
        return { focus: highlighted };
      }

      if (key === "down" && index < optionCount - 1) {
        highlighted = index + 1;
        return { focus: highlighted };
      }

      highlighted = null;
      return { closed: true };
    },
    highlighted: () => highlighted,
    isOpen: () => highlighted !== null,
    open(current) {
      highlighted = Math.max(0, Math.min(optionCount - 1, current));
      return highlighted;
    }
  };
}

// The remote key as a drop-down key; any other key closes an open list.
export function readDropdownKey(keyCode: number): DropdownKey {
  if (keyCode === remoteKeys.enter) {
    return "enter";
  }

  return readArrowDirection(keyCode) || "back";
}

// Shows the current value and a ▾ in the field's control.
export function renderDropdownControl(
  control: HTMLElement,
  name: string,
  value: string,
  open: boolean
): void {
  const documentRef = control.ownerDocument;
  const text = documentRef.createElement("span");
  const arrow = documentRef.createElement("span");

  text.className = "dropdown-value";
  text.textContent = value;
  arrow.className = "dropdown-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "▾";
  control.textContent = "";
  control.appendChild(text);
  control.appendChild(arrow);
  control.setAttribute("aria-haspopup", "listbox");
  control.setAttribute("aria-expanded", open ? "true" : "false");
  control.setAttribute("aria-label", `${name}: ${value}`);
}

// The open list: one focusable option per label, the chosen one marked with
// a check as well as its colour. `createOption` supplies each option's
// focusable control so the screen can key it.
export function renderDropdownList(
  documentRef: Document,
  name: string,
  labels: string[],
  chosen: number,
  createOption: (index: number) => HTMLElement
): HTMLElement {
  const list = documentRef.createElement("div");

  list.className = "dropdown-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", name);

  labels.forEach((label, index) => {
    const option = createOption(index);
    const check = documentRef.createElement("span");
    const text = documentRef.createElement("span");

    option.classList.add("dropdown-option");
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", index === chosen ? "true" : "false");
    check.className = "dropdown-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = index === chosen ? "✓" : "";
    text.textContent = label;
    option.textContent = "";
    option.appendChild(check);
    option.appendChild(text);

    if (index === chosen) {
      option.setAttribute("data-selected", "true");
    }

    list.appendChild(option);
  });

  return list;
}
