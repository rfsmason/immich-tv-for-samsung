import { formatLibraryViewTitle } from "../../presentation/library-labels";
import { formatMemoryContext, formatMemoryTitle } from "../../presentation/memory-labels";
import { formatPersonName } from "../../presentation/person-labels";
import { formatSearchSummary } from "../../presentation/search-labels";
import type { CollectionFeed, RemoteCollection, StaticCollectionInput } from "./collection-model";

// The collections loaded from their start (People, Search, Memories, and a
// library view opening oldest first): what each one is called, the paged
// feed behind it, and what the screen shows while it loads.

// The paged feed behind a person, search or library collection; none for a
// Memory, which loads whole.
export function readRemoteFeed(collection: RemoteCollection): CollectionFeed | null {
  if (collection.kind === "person") {
    return { kind: "person", order: collection.order, personId: collection.person.id };
  }

  if (collection.kind === "library") {
    return { kind: collection.view, order: collection.order };
  }

  return collection.kind === "search"
    ? { criteria: collection.criteria, kind: "search", order: collection.order }
    : null;
}

// The collection's empty shell, shown until its first page arrives.
export function readRemoteCollectionInput(
  collection: RemoteCollection,
  feed: CollectionFeed | null
): StaticCollectionInput {
  return collection.kind === "library"
    ? {
        assets: [],
        focusedIndex: 0,
        feed: { feed: feed!, nextPage: null },
        id: collection.view,
        title: formatLibraryViewTitle(collection.view),
        initialView: "grid",
        parent: collection.parent
      }
    : collection.kind === "person"
      ? {
          assets: [],
          focusedIndex: 0,
          feed: { feed: feed!, nextPage: null },
          id: `person-${collection.person.id}`,
          title: formatPersonName(collection.person),
          initialView: "grid",
          parent: collection.parent
        }
      : collection.kind === "search"
        ? {
            assets: [],
            emptyMessage: "No photos match. Try fewer people or a wider date range.",
            focusedIndex: 0,
            feed: { feed: feed!, nextPage: null },
            id: "search",
            title: formatSearchSummary(collection.criteria),
            initialView: "grid",
            parent: collection.parent
          }
        : {
            assets: [],
            focusedIndex: 0,
            id: collection.memory.id,
            title: formatMemoryTitle(collection.memory),
            context: formatMemoryContext(collection.memory),
            initialView: "grid",
            parent: collection.parent,
            viewingKind: "memory"
          };
}

export function readRemoteCollectionLoadingMessage(collection: RemoteCollection): string {
  return collection.kind === "search"
    ? "Searching your library..."
    : "Loading photos and videos...";
}
