// The selection behind Search's multi-select pickers (people, albums): OK
// toggles an item, a selected card has a ring and a check mark so the state
// never relies on colour alone, Done counts the selection, and a pick past
// the cap is explained rather than ignored.

type PickerSelectionOptions = {
  // Why the pick of `name` is refused when the selection is full.
  capMessage(name: string): string;
  documentRef: Document;
  done: HTMLElement;
  max: number;
  message: HTMLElement;
};

export type PickerSelection<T extends { id: string }> = {
  // Shows or clears a card's selected state. It runs again on cards that
  // stay on screen, so it clears as well as sets.
  decorateCard(card: HTMLElement, id: string): void;
  // Starts from the items already chosen.
  open(selected: T[]): void;
  selected(): T[];
  // Adds or removes `item`; false when the selection is full and unchanged.
  toggle(item: T, name: string): boolean;
};

export function createPickerSelection<T extends { id: string }>(
  options: PickerSelectionOptions
): PickerSelection<T> {
  const { documentRef, done, message } = options;
  let selected: T[] = [];

  function isSelected(id: string): boolean {
    return selected.some((item) => item.id === id);
  }

  function renderDone(): void {
    done.textContent = selected.length ? `Done (${selected.length} selected)` : "Done";
  }

  function setMessage(text: string): void {
    message.textContent = text;
    message.hidden = !text;
  }

  return {
    decorateCard(card, id) {
      const chosen = isSelected(id);
      const check = card.querySelector(".picker-check");

      card.setAttribute("aria-pressed", chosen ? "true" : "false");

      if (!chosen) {
        card.removeAttribute("data-selected");

        if (check) {
          card.removeChild(check);
        }

        return;
      }

      card.setAttribute("data-selected", "true");
      card.setAttribute("aria-label", `${card.getAttribute("aria-label") || ""}, selected`);

      if (!check) {
        const mark = documentRef.createElement("span");

        mark.className = "picker-check";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "✓";
        card.appendChild(mark);
      }
    },
    open(items) {
      selected = items.slice(0, options.max);
      setMessage("");
      renderDone();
    },
    selected: () => selected.slice(),
    toggle(item, name) {
      if (isSelected(item.id)) {
        selected = selected.filter((other) => other.id !== item.id);
      } else if (selected.length >= options.max) {
        setMessage(options.capMessage(name));
        return false;
      } else {
        selected = selected.concat(item);
      }

      setMessage("");
      renderDone();
      return true;
    }
  };
}
