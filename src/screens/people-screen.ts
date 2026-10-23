import type { AlbumService } from "../app/album-service";
import type { Person } from "../domain/home";
import { mountPeopleGrid, type PeopleGridController } from "./people/people-grid";

export { peoplePageSize, retainedPeoplePageCount } from "./people/people-grid";

// Every recognised person, as Immich orders them, in a card grid under Home
// (ADR 0013). OK opens the person's photos; the paging, windowing and faces
// come from the shared people grid.

type PeopleScreenOptions = {
  documentRef?: Document;
  onBack(): void;
  onOpenPerson(person: Person): void;
  onReturnToShell?(): void;
  service: Pick<AlbumService, "loadPeoplePage" | "loadPersonThumbnailUrl" | "revokeThumbnailUrl">;
};

export type PeopleScreenController = Omit<PeopleGridController, "refreshCards">;

export function mountPeopleScreen(options: PeopleScreenOptions): PeopleScreenController {
  const documentRef = options.documentRef || document;

  return mountPeopleGrid({
    documentRef,
    elements: {
      backdrop: requireElement(documentRef, "people-backdrop") as HTMLImageElement,
      grid: requireElement(documentRef, "people-grid"),
      retry: requireElement(documentRef, "people-retry"),
      root: requireElement(documentRef, "people-screen"),
      status: requireElement(documentRef, "people-status")
    },
    emptyMessage:
      "No people yet. People appear here once Immich's face recognition has found them.",
    onActivate: options.onOpenPerson,
    onBack: options.onBack,
    onReturnToShell: options.onReturnToShell,
    service: options.service
  });
}

function requireElement(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}
