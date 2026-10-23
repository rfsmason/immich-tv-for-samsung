import type { Album, AlbumAsset, AlbumAssetPage, AlbumAssetPageToken } from "../domain/album";
import type { Memory, Person } from "../domain/home";
import type { SearchCriteria, SearchPerson } from "../domain/search";
import type { Logger } from "../logging/logger";
import type { AppLifecycle } from "../platform/tizen/lifecycle";
import { mountAlbumDetailScreen, type CollectionFeed } from "../screens/album-detail-screen";
import { isLibraryView, type LibraryView } from "../domain/library";
import { formatLibraryViewTitle } from "../presentation/library-labels";
import type { HomeAssetRailId } from "../screens/home/home-model";
import { viewingHistoryLimit } from "../storage/viewing-history-store";
import { mountAlbumsScreen } from "../screens/albums-screen";
import { mountConnectionScreen } from "../screens/connection-screen";
import { mountExitConfirmation } from "../screens/exit-confirmation";
import { mountHomeScreen } from "../screens/home-screen";
import { mountMemoriesScreen } from "../screens/memories-screen";
import { mountPeopleScreen } from "../screens/people-screen";
import { mountPeoplePicker } from "../screens/search/people-picker-screen";
import { mountSearchScreen } from "../screens/search/search-screen";
import type { AppSettingsStore } from "../storage/app-settings-store";
import { readEnabledHomeRails } from "../domain/app-settings";
import type { AlbumService } from "./album-service";
import {
  mountApplicationShell,
  type ShellScreenController,
  type TopLevelDestinationId
} from "./app-shell";
import type { ConnectionService } from "./connection-service";
import { createScreenRegistry } from "./screen-registry";
import type { ViewingHistoryService } from "./viewing-history-service";

// Application composition: mounts the shell and every screen over injected
// services and platform abstractions, and owns navigation between them
// (ADR 0007 shell contract, ADR 0012 routing). No router framework: a typed
// route records where the user is and which parent Back returns to.

type AppRoute =
  | { kind: "destination"; destination: TopLevelDestinationId }
  | { kind: "memories" }
  | { kind: "people" }
  | { kind: "album"; parent: "albums" | "home" }
  | { kind: "home-collection" }
  // A library view; Back restores the rail item it opened from, or See more.
  | { kind: "library"; view: LibraryView; parent: "home"; entry: "item" | "see-more" }
  | { kind: "memory"; parent: "home" | "memories" }
  | { kind: "person"; parent: "home" | "people" }
  | { kind: "search-people"; parent: "search" }
  | { kind: "search-results"; parent: "search" };

export type ApplicationDependencies = {
  albumService: AlbumService;
  connectionService: ConnectionService;
  documentRef?: Document;
  lifecycle: AppLifecycle;
  logger: Logger;
  settingsStore: AppSettingsStore;
  viewingHistory: ViewingHistoryService;
};

export type Application = {
  destroy(): void;
  // Routes to Home when connection settings exist, otherwise to Settings.
  start(): void;
};

// The longest the splash waits for Home's rails at launch (see
// showHomeBehindSplash).
const homeRevealLimitMs = 10000;

export function composeApplication(dependencies: ApplicationDependencies): Application {
  const { albumService, connectionService, lifecycle, logger, settingsStore, viewingHistory } =
    dependencies;
  const documentRef = dependencies.documentRef || document;
  let destroyed = false;
  let route: AppRoute | null = null;

  const exitConfirmation = mountExitConfirmation({
    documentRef,
    onExit() {
      lifecycle.exit();
    }
  });
  const homeScreen = mountHomeScreen({
    documentRef,
    history: viewingHistory,
    loadEnabledRails: () => readEnabledHomeRails(settingsStore.load()),
    onBrowseAlbums() {
      showAlbums({ refresh: false });
      albumsScreen.focusContent();
    },
    onBrowseMemories() {
      showMemories();
    },
    onBrowsePeople() {
      showPeople();
    },
    onOpenAlbum(album) {
      showAlbumDetail(album, "home");
    },
    onOpenAssetCollection(input) {
      showHomeAssetCollection(input);
    },
    onOpenMemory(memory) {
      showMemory(memory, "home");
    },
    onOpenPerson(person) {
      showPerson(person, "home");
    },
    onOpenSettings() {
      shell.activateDestination("settings");
      connectionScreen.focusSection("home");
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    service: albumService
  });
  const memoriesScreen = mountMemoriesScreen({
    documentRef,
    onBack() {
      showHome({ restoreContentFocus: true });
    },
    onOpenMemory(memory) {
      showMemory(memory, "memories");
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    service: albumService
  });
  const peopleScreen = mountPeopleScreen({
    documentRef,
    onBack() {
      showHome({ restoreContentFocus: true });
    },
    onOpenPerson(person) {
      showPerson(person, "people");
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    service: albumService
  });
  const searchScreen = mountSearchScreen({
    documentRef,
    onAddPeople(people) {
      showSearchPeople(people);
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    onShowPhotos(criteria) {
      showSearchResults(criteria);
    },
    service: albumService
  });
  const peoplePicker = mountPeoplePicker({
    documentRef,
    onDone(people) {
      searchScreen.setPeople(people);
      showSearch();
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    service: albumService
  });
  const connectionScreen = mountConnectionScreen({
    documentRef,
    onBack(options) {
      shell.routeBackFromSettings(options);
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    onSaved() {
      memoriesScreen.reset();
      peopleScreen.reset();
      searchScreen.reset();
      peoplePicker.reset();
      showHome({ bypassGuard: true });
      homeScreen.refresh();
    },
    service: connectionService,
    settingsStore
  });
  const albumsScreen = mountAlbumsScreen({
    documentRef,
    onOpenAlbum(album) {
      showAlbumDetail(album, "albums");
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    service: albumService
  });
  const collectionScreen = mountAlbumDetailScreen({
    documentRef,
    loadFeedPage: (feed, page) => loadFeedPage(feed, page),
    onAssetViewed(asset, source) {
      void viewingHistory.record(asset, source);
    },
    onBack(lastViewedAssetId) {
      routeBackFromCollection(lastViewedAssetId);
    },
    onReturnToShell() {
      shell.focusActiveDestinationNav();
    },
    onViewerOpened() {
      shell.collapseRail();
    },
    service: albumService,
    settingsStore
  });
  const screens = createScreenRegistry({
    albums: albumsScreen,
    collection: collectionScreen,
    home: homeScreen,
    memories: memoriesScreen,
    people: peopleScreen,
    search: searchScreen,
    "search-people": peoplePicker,
    settings: connectionScreen
  });

  // The registry hides every other screen whenever a destination shows, so
  // the shell's per-destination hide has nothing left to do.
  function destination(focusContent: () => void, show: () => void): ShellScreenController {
    return { focusContent, hide() {}, show };
  }

  const shell = mountApplicationShell({
    documentRef,
    onRefresh() {
      refreshEverything();
    },
    onBeforeDestinationActivated(fromDestination, toDestination) {
      if (fromDestination === "settings" && toDestination !== "settings") {
        return connectionScreen.requestExit();
      }

      return true;
    },
    onRootBack(activeDestination) {
      // Unsaved Settings stay guarded: the guard panel takes focus instead.
      if (activeDestination === "settings" && !connectionScreen.requestExit()) {
        return;
      }

      exitConfirmation.open();
    },
    screens: {
      albums: destination(
        () => albumsScreen.focusContent(),
        () => {
          enterDestination("albums", "albums", null);
          albumsScreen.show();
        }
      ),
      home: destination(
        () => homeScreen.focusContent(),
        () => {
          enterDestination("home", "home", null);
          homeScreen.show();
        }
      ),
      photos: destination(
        () => collectionScreen.focusContent(),
        () => {
          enterDestination("photos", "collection", collectionScreen);
          shell.hideSplash();
          resetPageScroll();
          collectionScreen.showPhotos();
        }
      ),
      search: destination(
        () => searchScreen.focusContent(),
        () => {
          enterDestination("search", "search", null);
          searchScreen.show();
        }
      ),
      settings: destination(
        () => connectionScreen.focusContent(),
        () => {
          enterDestination("settings", "settings", null);
          connectionScreen.show({ allowBack: albumService.loadSettings() !== null });
        }
      )
    }
  });

  lifecycle.onVisibilityChange((visibility) => {
    if (visibility === "hidden") {
      collectionScreen.suspendPlayback();
      return;
    }

    // Playback stays paused on return. Keep a visible focus target if the TV
    // dropped focus while the app was in the background.
    if (!documentRef.activeElement || documentRef.activeElement === documentRef.body) {
      shell.focusActiveContent();
    }
  });

  function enterDestination(
    id: TopLevelDestinationId,
    screen: "albums" | "collection" | "home" | "search" | "settings",
    contentFocus: { focusContent(): void } | null
  ): void {
    route = { destination: id, kind: "destination" };
    shell.expandRail();
    shell.setContentFocusController(contentFocus);
    screens.showOnly(screen);
  }

  // Child screens collapse the rail and own content focus.
  function enterChild(
    nextRoute: Exclude<AppRoute, { kind: "destination" }>,
    screen: "collection" | "memories" | "people" | "search-people",
    contentFocus: { focusContent(): void }
  ): void {
    route = nextRoute;
    shell.collapseRail();
    shell.setContentFocusController(contentFocus);
    screens.showOnly(screen);
    resetPageScroll();
  }

  function routeBackFromCollection(lastViewedAssetId?: string): void {
    if (route?.kind === "search-results") {
      showSearch();
      searchScreen.focusShowPhotos();
      return;
    }

    if (route?.kind === "person" && route.parent === "people") {
      showPeople();
      return;
    }

    if (route?.kind === "memory") {
      if (route.parent === "memories") {
        showMemories();
      } else {
        showHome({ restoreContentFocus: true });
      }
      return;
    }

    if (route?.kind === "library") {
      // From See more, Back returns to See more rather than a viewed asset.
      showHome({
        restoreContentFocus: true,
        lastViewedAssetId: route.entry === "item" ? lastViewedAssetId : undefined
      });
      return;
    }

    if (
      route?.kind === "home-collection" ||
      route?.kind === "person" ||
      (route?.kind === "album" && route.parent === "home")
    ) {
      showHome({ restoreContentFocus: true, lastViewedAssetId });
      return;
    }

    if (route?.kind === "album" && route.parent === "albums") {
      showAlbums({ refresh: false });
      return;
    }

    // Top-level collections (Photos) return to the rail themselves.
    shell.focusActiveDestinationNav();
  }

  function showAlbums(options: { bypassGuard?: boolean; refresh: boolean }): void {
    shell.activateDestination("albums", { bypassGuard: options.bypassGuard });

    if (options.refresh) {
      albumsScreen.refresh();
    }
  }

  function showHome(
    options: {
      bypassGuard?: boolean;
      restoreContentFocus?: boolean;
      lastViewedAssetId?: string;
    } = {}
  ): void {
    shell.activateDestination("home", { bypassGuard: options.bypassGuard });

    // Destination activation focuses the shell by default. Returning from a
    // child restores Home's retained rail and tile after that activation finishes.
    if (options.restoreContentFocus) {
      homeScreen.focusContent(options.lastViewedAssetId);
    }
  }

  // The rail's Refresh: reload every screen's data, keeping Search's
  // criteria, and start again on Home as at launch, with focus on Home in
  // the rail. Home loads as it opens; the other screens are hidden by then
  // and load when next shown.
  function refreshEverything(): void {
    homeScreen.reset();
    shell.activateDestination("home");
    memoriesScreen.reset();
    peopleScreen.reset();
    peoplePicker.reset();
    albumsScreen.refresh();
    collectionScreen.refreshPhotos();
  }

  // At launch, Home loads behind the splash and appears once every rail has
  // loaded or failed, so it opens complete instead of filling in. A server that
  // stalls rather than refusing would keep rails waiting for their request
  // timeouts, so after homeRevealLimitMs Home appears anyway and its last rails
  // finish on screen. It is revealed once, so a late finish can't move focus.
  function showHomeBehindSplash(): void {
    let revealed = false;
    const reveal = () => {
      // Only Home, and only once: by now something else may be showing.
      if (revealed || destroyed || route?.kind !== "destination" || route.destination !== "home") {
        return;
      }

      revealed = true;
      documentRef.defaultView?.clearTimeout(limit);
      shell.revealApp();
      homeScreen.relayout();
    };
    const limit = documentRef.defaultView?.setTimeout(reveal, homeRevealLimitMs);

    shell.setSplashStatus("Loading your library...");
    shell.activateDestination("home", { reveal: false });
    void homeScreen.whenLoaded().then(reveal);
  }

  function showSettings(): void {
    shell.expandRail();
    shell.setContentFocusController(null);
    shell.activateDestination("settings");
  }

  function showAlbumDetail(album: Album, parent: "albums" | "home"): void {
    enterChild({ kind: "album", parent }, "collection", collectionScreen);
    shell.hideSplash();
    collectionScreen.show(album, parent);
  }

  function showHomeAssetCollection(input: {
    assets: AlbumAsset[];
    entry: "item" | "see-more";
    index: number;
    rail: HomeAssetRailId;
    title: string;
  }): void {
    const view = isLibraryView(input.rail) ? input.rail : null;

    enterChild(
      view
        ? { entry: input.entry, kind: "library", parent: "home", view }
        : { kind: "home-collection" },
      "collection",
      collectionScreen
    );
    shell.hideSplash();
    collectionScreen.showFeedCollection({
      assets: input.assets,
      feed: { kind: input.rail },
      focusedIndex: input.index,
      id: view || `home-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: view ? formatLibraryViewTitle(view) : input.title
    });
  }

  // Pages for collections opened from Home. Recently Viewed is the bounded
  // local history, so it has a single page.
  function loadFeedPage(feed: CollectionFeed, page: AlbumAssetPageToken): Promise<AlbumAssetPage> {
    if (feed.kind === "favorites") {
      return albumService.loadFavoriteAssetsPage(page);
    }

    if (feed.kind === "recently-added") {
      return albumService.loadRecentlyAddedAssetsPage(page);
    }

    if (feed.kind === "videos") {
      return albumService.loadVideoAssetsPage(page);
    }

    if (feed.kind === "person") {
      return albumService.loadPersonAssetsPage(feed.personId, page);
    }

    if (feed.kind === "search") {
      return albumService.loadSearchAssetsPage(feed.criteria, page);
    }

    return viewingHistory
      .loadAssets(viewingHistoryLimit)
      .then((history) => ({ assets: history.assets, nextPageToken: null, total: null }));
  }

  // Back to the Search destination from one of its children, landing on its
  // remembered control rather than the rail.
  function showSearch(): void {
    shell.activateDestination("search");
    searchScreen.focusContent();
  }

  function showSearchPeople(people: SearchPerson[]): void {
    enterChild({ kind: "search-people", parent: "search" }, "search-people", peoplePicker);
    peoplePicker.open(people);
  }

  function showSearchResults(criteria: SearchCriteria): void {
    enterChild({ kind: "search-results", parent: "search" }, "collection", collectionScreen);
    shell.hideSplash();
    collectionScreen.showSearchResults(criteria);
  }

  function showPeople(): void {
    enterChild({ kind: "people" }, "people", peopleScreen);
    peopleScreen.show();
  }

  function showPerson(person: Person, parent: "home" | "people"): void {
    enterChild({ kind: "person", parent }, "collection", collectionScreen);
    shell.hideSplash();
    collectionScreen.showPerson(person, parent);
  }

  function showMemories(): void {
    enterChild({ kind: "memories" }, "memories", memoriesScreen);
    memoriesScreen.show();
  }

  function showMemory(memory: Memory, parent: "home" | "memories"): void {
    enterChild({ kind: "memory", parent }, "collection", collectionScreen);
    shell.hideSplash();
    collectionScreen.showMemory(memory, parent);
  }

  function resetPageScroll(): void {
    window.scrollTo(0, 0);
    documentRef.documentElement.scrollTop = 0;
    documentRef.body.scrollTop = 0;
  }

  return {
    destroy() {
      destroyed = true;
      exitConfirmation.destroy();
      shell.destroy();
      homeScreen.destroy();
      memoriesScreen.destroy();
      peopleScreen.destroy();
      searchScreen.destroy();
      peoplePicker.destroy();
      connectionScreen.destroy();
      albumsScreen.destroy();
      collectionScreen.destroy();
    },
    start() {
      try {
        if (albumService.loadSettings()) {
          showHomeBehindSplash();
        } else {
          showSettings();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to restore startup state.";

        shell.showSplashError(message);
        logger.error("Immich TV startup failed.", { error });
      }

      logger.info("Immich TV app mounted.", { route });
    }
  };
}
