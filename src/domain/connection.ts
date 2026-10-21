export type ConnectionSettings = {
  apiKey: string;
  serverUrl: string;
};

export type ServerVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string | null;
};

export type CurrentUser = {
  email: string;
  id: string;
  name: string;
};

export type ConnectionResult = {
  serverLabel: string;
  userLabel: string;
  // Household-facing warning when the server is older than the minimum
  // supported Immich version. Saving is still allowed.
  versionWarning: string | null;
};
