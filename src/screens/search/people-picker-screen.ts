import type { AlbumService } from "../../app/album-service";
import type { Person } from "../../domain/home";
import { maxSearchPeople, type SearchPerson } from "../../domain/search";
import { formatPersonName } from "../../presentation/person-labels";
import { mountPeopleGrid } from "../people/people-grid";
import { createPickerSelection } from "./picker-selection";

// Search's people picker (ADR 0014): the shared people grid with OK toggling a
// person in or out of the selection (picker-selection.ts). Done and Back both return the selection;
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
  const selection = createPickerSelection<SearchPerson>({
    capMessage: (name) =>
      `You can choose up to ${maxSearchPeople} people. Remove someone to add ${name}.`,
    documentRef,
    done,
    max: maxSearchPeople,
    message: requireElement(documentRef, "search-people-message")
  });

  function toggle(person: Person): void {
    if (selection.toggle({ id: person.id, name: person.name }, formatPersonName(person))) {
      grid.refreshCards();
    }
  }

  function finish(): void {
    options.onDone(selection.selected());
  }

  const grid = mountPeopleGrid({
    decorateCard: (card, person) => selection.decorateCard(card, person.id),
    documentRef,
    elements: {
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
      selection.open(people);
      grid.show();
    },
    reset() {
      grid.reset();
      selection.open([]);
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
