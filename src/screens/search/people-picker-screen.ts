import type { AlbumService } from "../../app/album-service";
import type { Person } from "../../domain/home";
import { maxSearchPeople, type SearchPerson } from "../../domain/search";
import { formatPersonName } from "../../presentation/person-labels";
import { mountPeopleGrid } from "../people/people-grid";

// Search's people picker (ADR 0014): the shared people grid with OK toggling a
// person in or out of the selection. Done and Back both return the selection;
// cancelling a multi-select by accident would be frustrating on a remote.

type PeoplePickerOptions = {
  documentRef?: Document;
  onDone(people: SearchPerson[]): void;
  onReturnToShell?(): void;
  service: Pick<AlbumService, "loadPeoplePage" | "loadPersonThumbnailUrl" | "revokeThumbnailUrl">;
};

export type PeoplePickerController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  // Opens with the people already chosen shown as selected.
  open(selected: SearchPerson[]): void;
  reset(): void;
};

export function mountPeoplePicker(options: PeoplePickerOptions): PeoplePickerController {
  const documentRef = options.documentRef || document;
  const done = requireElement(documentRef, "search-people-done");
  const message = requireElement(documentRef, "search-people-message");
  let selected: SearchPerson[] = [];

  function isSelected(id: string): boolean {
    return selected.some((person) => person.id === id);
  }

  function renderDone(): void {
    done.textContent = selected.length ? `Done (${selected.length} selected)` : "Done";
  }

  function setMessage(text: string): void {
    message.textContent = text;
    message.hidden = !text;
  }

  function toggle(person: Person): void {
    if (isSelected(person.id)) {
      selected = selected.filter((item) => item.id !== person.id);
      setMessage("");
    } else if (selected.length >= maxSearchPeople) {
      setMessage(
        `You can choose up to ${maxSearchPeople} people. Remove someone to add ${formatPersonName(person)}.`
      );
      return;
    } else {
      selected = selected.concat({ id: person.id, name: person.name });
      setMessage("");
    }

    renderDone();
    grid.refreshCards();
  }

  function finish(): void {
    options.onDone(selected.slice());
  }

  const grid = mountPeopleGrid({
    // Runs again on cards that stay on screen, so it clears as well as sets.
    decorateCard(card, person) {
      const chosen = isSelected(person.id);
      const check = card.querySelector(".person-check");

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

        mark.className = "person-check";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "✓";
        card.appendChild(mark);
      }
    },
    documentRef,
    elements: {
      backdrop: requireElement(documentRef, "search-people-backdrop") as HTMLImageElement,
      grid: requireElement(documentRef, "search-people-grid"),
      retry: requireElement(documentRef, "search-people-retry"),
      root: requireElement(documentRef, "search-people-screen"),
      status: requireElement(documentRef, "search-people-status")
    },
    emptyMessage:
      "No people yet. People appear here once Immich's face recognition has found them. Press Back to return to Search.",
    onActivate: toggle,
    onBack: finish,
    onReturnToShell: options.onReturnToShell,
    onTopControl(control) {
      if (control === done) {
        finish();
      }
    },
    service: options.service,
    topControls: () => [done]
  });

  return {
    destroy() {
      grid.destroy();
    },
    focusContent() {
      grid.focusContent();
    },
    hide() {
      grid.hide();
    },
    open(people) {
      selected = people.slice(0, maxSearchPeople);
      setMessage("");
      renderDone();
      grid.show();
    },
    reset() {
      grid.reset();
      selected = [];
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
