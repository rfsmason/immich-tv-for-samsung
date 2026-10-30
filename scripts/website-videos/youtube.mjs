// YouTube Data API v3 videos.list: one request for every video (1 quota unit),
// with only the fields the gallery needs.
// https://developers.google.com/youtube/v3/docs/videos/list

const endpoint = "https://www.googleapis.com/youtube/v3/videos";
const fields = "items(id,snippet(title,description),status(privacyStatus,embeddable))";

function redact(text, apiKey) {
  return apiKey ? String(text).split(apiKey).join("[redacted]") : String(text);
}

function isVideo(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.snippet?.title === "string" &&
    typeof item.snippet?.description === "string" &&
    typeof item.status?.privacyStatus === "string" &&
    typeof item.status?.embeddable === "boolean"
  );
}

// Returns a Map from video ID to { title, description, privacyStatus,
// embeddable }. Videos YouTube doesn't return are simply absent, since the
// response's order and completeness aren't guaranteed. Neither the key nor
// the request URL ever appears in an error.
export async function fetchVideos(ids, apiKey, fetchImpl = fetch) {
  const query = new URLSearchParams({ part: "snippet,status", id: ids.join(","), fields });
  query.set("key", apiKey);

  let response;

  try {
    response = await fetchImpl(`${endpoint}?${query}`, { headers: { Accept: "application/json" } });
  } catch (error) {
    // The error's own message can quote the URL, so only its code is kept.
    const code = typeof error?.cause?.code === "string" ? ` (${error.cause.code})` : "";
    throw new Error(`Could not reach the YouTube Data API${code}. Check the network connection.`);
  }

  let body;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? `: ${body.error.message}` : ".";
    throw new Error(
      `The YouTube Data API refused the request (HTTP ${response.status})${redact(message, apiKey)}`
    );
  }

  if (!Array.isArray(body?.items) || !body.items.every(isVideo)) {
    throw new Error("The YouTube Data API returned an unexpected response.");
  }

  return new Map(
    body.items.map((item) => [
      item.id,
      {
        title: item.snippet.title,
        description: item.snippet.description,
        privacyStatus: item.status.privacyStatus,
        embeddable: item.status.embeddable
      }
    ])
  );
}

// "People – Immich TV for Samsung" → "People": the text before the first
// spaced en dash or spaced hyphen, or the whole title without one.
export function titleFromYouTube(title) {
  const cut = title.split(/ [–-] /)[0].trim();
  return cut === "" ? title.trim() : cut;
}

// The first paragraph (up to the first blank line), whitespace collapsed.
export function descriptionFromYouTube(description) {
  return description
    .split(/\r?\n[^\S\r\n]*\r?\n/)[0]
    .replace(/\s+/g, " ")
    .trim();
}
