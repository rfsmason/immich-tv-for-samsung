// Connection details an installer can fill in (ADR 0022). Apps2Samsung's
// community catalogue asks for a server URL and API key before it installs
// the app, and writes them between these empty quotes. A package installed
// any other way keeps them empty, and the app ignores it.
// Keep both lines exactly as they are: the catalogue entry finds them by
// their text, and scripts/check-static-app.mjs fails if they change.
window.IMMICH_TV_INSTALL_PRESET = {
  serverUrl: "",
  apiKey: ""
};
