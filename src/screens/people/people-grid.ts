import type { AlbumService } from "../../app/album-service";
import type { Person } from "../../domain/home";
import {
  mountCardGrid,
  type CardGridController,
  type CardGridElements,
  type CardGridOptions
} from "../card-grid";
import { createPersonCard, personCardLabel, setPersonCardFace } from "./person-card";

// The shared card grid set up for people (ADR 0013): six faces to a row, in
// Immich's order, paged from /people. The People browser and Search's people
// picker use it.

export const peoplePageSize = 30;
export const retainedPeoplePageCount = 4;

export type PeopleGridOptions = Pick<
  CardGridOptions<Person>,
  | "decorateCard"
  | "documentRef"
  | "emptyMessage"
  | "onActivate"
  | "onBack"
  | "onReturnToShell"
  | "onTopControl"
  | "topControls"
> & {
  elements: CardGridElements;
  service: Pick<AlbumService, "loadPeoplePage" | "loadPersonThumbnailUrl" | "revokeThumbnailUrl">;
};

export type PeopleGridController = CardGridController;

export function mountPeopleGrid(options: PeopleGridOptions): PeopleGridController {
  const { service, ...screen } = options;

  return mountCardGrid<Person>({
    ...screen,
    cards: {
      attributes: { id: "data-person-id", index: "data-person-index" },
      create: createPersonCard,
      label: personCardLabel,
      setImage: setPersonCardFace
    },
    columnCount: 6,
    // Room for the face's 6% growth and 12 px focus ring.
    focusMargin: 24,
    loadImageUrl: service.loadPersonThumbnailUrl,
    loadingMessages: { first: "Loading people...", more: "Loading more people..." },
    async loadPage(page, size) {
      const result = await service.loadPeoplePage(page, size);

      return { hasMore: result.hasMore, items: result.people };
    },
    pageSize: peoplePageSize,
    retainedPageCount: retainedPeoplePageCount,
    revokeImageUrl: service.revokeThumbnailUrl,
    styles: {
      gapProperty: "--person-grid-gap",
      spacerClass: "person-grid-spacer",
      spacerRowsProperty: "--person-spacer-rows"
    }
  });
}
