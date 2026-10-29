import { home } from "./home";
import { photosTimeline } from "./photos-timeline";
import { albums } from "./albums";
import { albumGrid } from "./album-grid";
import { viewerImage } from "./viewer-image";
import { people } from "./people";
import { personCollection } from "./person";
import { memories } from "./memories";
import { favorites } from "./favorites";
import { videos } from "./videos";
import { recentlyAdded } from "./recently-added";
import { search } from "./search";
import { searchAlbumPicker, searchPlacePicker, searchV2Panel } from "./search-v2";
import { ambientClock, settingsAmbient } from "./ambient";
import { homeHighContrast, settingsDisplay, viewerHighContrast, viewerSeek } from "./accessibility";
import { settingsHome } from "./settings-home";
import { viewerFaces } from "./viewer-faces";
import { tour } from "./tour";
import { peopleTour } from "./people-tour";
import { photosTour } from "./photos-tour";
import { searchTour } from "./search-tour";
import { settingsTour } from "./settings-tour";
import { albumsTour } from "./albums-tour";
import { memoriesTour } from "./memories-tour";
import { mediaTour } from "./media-tour";
export const scenarios = [
  home,
  photosTimeline,
  albums,
  albumGrid,
  viewerImage,
  people,
  personCollection,
  memories,
  favorites,
  videos,
  recentlyAdded,
  search,
  searchV2Panel,
  searchPlacePicker,
  searchAlbumPicker,
  settingsHome,
  settingsAmbient,
  ambientClock,
  viewerFaces,
  settingsDisplay,
  homeHighContrast,
  viewerHighContrast,
  viewerSeek,
  tour,
  peopleTour,
  photosTour,
  searchTour,
  settingsTour,
  albumsTour,
  memoriesTour,
  mediaTour
];
