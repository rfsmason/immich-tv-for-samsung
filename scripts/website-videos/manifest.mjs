// The website's demo video list (website/demo-videos.json): YouTube links in
// display order, each a URL string or { url, title?, description? } whose own
// title and description override the ones read from YouTube.

// The same 11-character ID pattern as website/videos.js accepts.
const videoIdPattern = /^[\w-]{11}$/;
const entryKeys = ["url", "title", "description"];

// Accepts https://youtu.be/<id> and https://www.youtube.com/watch?v=<id>,
// ignoring extra parameters such as t, si or list. Returns the video ID, or
// null for anything else, including playlist-only links.
export function parseYouTubeUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    return null;
  }

  let id = null;

  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (url.hostname === "www.youtube.com" && url.pathname === "/watch") {
    id = url.searchParams.get("v");
  }

  return id !== null && videoIdPattern.test(id) ? id : null;
}

function readOverride(entry, key, where, errors) {
  const value = entry[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${where}: "${key}" must be a non-empty string.`);
    return undefined;
  }

  return value.trim();
}

// Validates the parsed JSON and returns [{ id, title?, description? }] in
// display order, or throws one error listing every problem found.
export function validateManifest(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("demo-videos.json must be a non-empty array of YouTube links.");
  }

  const errors = [];
  const entries = [];
  const seen = new Map();

  data.forEach((entry, index) => {
    const where = `Entry ${index + 1}`;
    let url;
    let title;
    let description;

    if (typeof entry === "string") {
      url = entry;
    } else if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      const unknown = Object.keys(entry).filter((key) => !entryKeys.includes(key));

      if (unknown.length > 0) {
        errors.push(
          `${where}: unknown ${unknown.length === 1 ? "key" : "keys"} ${unknown
            .map((key) => `"${key}"`)
            .join(", ")} (allowed: url, title, description).`
        );
      }

      if (typeof entry.url !== "string") {
        errors.push(`${where}: "url" must be a YouTube link.`);
        return;
      }

      url = entry.url;
      title = readOverride(entry, "title", where, errors);
      description = readOverride(entry, "description", where, errors);
    } else {
      errors.push(`${where}: must be a YouTube link or { url, title?, description? }.`);
      return;
    }

    const id = parseYouTubeUrl(url);

    if (id === null) {
      errors.push(
        `${where}: "${url}" is not a https://youtu.be/<id> or https://www.youtube.com/watch?v=<id> link.`
      );
      return;
    }

    if (seen.has(id)) {
      errors.push(`${where}: video ${id} is already entry ${seen.get(id)}.`);
      return;
    }

    seen.set(id, index + 1);
    entries.push({ id, title, description });
  });

  if (errors.length > 0) {
    throw new Error(`demo-videos.json is not valid:\n  ${errors.join("\n  ")}`);
  }

  return entries;
}
