// The demo video tiles in website/index.html: built from the manifest and
// YouTube's details, written between the demo-videos marker comments, and
// read back for --check and the change summary.

import { descriptionFromYouTube, titleFromYouTube } from "./youtube.mjs";

export const startMarker = "<!-- demo-videos:start";
export const endMarker = "<!-- demo-videos:end -->";
export const maxDescriptionLength = 160;

// Escapes HTML text and attribute values. Non-ASCII characters become numeric
// references, as in the rest of index.html (&#8217; and so on).
export function escapeHtml(text) {
  return text.replace(/[&<>"]|[^\x00-\x7f]/gu, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return `&#${character.codePointAt(0)};`;
    }
  });
}

// Combines each manifest entry with YouTube's details. Every problem is
// collected and thrown together, so nothing is written until all tiles are
// right.
export function buildTiles(entries, videos) {
  const errors = [];
  const tiles = [];
  const titles = new Map();

  entries.forEach((entry, index) => {
    const where = `Tile ${index + 1} (${entry.id})`;
    const video = videos.get(entry.id);

    if (!video) {
      errors.push(`${where}: YouTube did not return this video. Check the ID and that it exists.`);
      return;
    }

    if (video.privacyStatus === "private") {
      errors.push(`${where}: the video is private. Make it Public or Unlisted.`);
    }

    if (video.embeddable !== true) {
      errors.push(`${where}: the video does not allow embedding. Turn on "Allow embedding".`);
    }

    const title = entry.title ?? titleFromYouTube(video.title);
    const description = entry.description ?? descriptionFromYouTube(video.description);
    const length = [...description].length;

    if (title === "") {
      errors.push(`${where}: no title. Give the video one, or add a "title" override.`);
    } else if (titles.has(title)) {
      errors.push(`${where}: the title "${title}" is already tile ${titles.get(title)}'s.`);
    } else {
      titles.set(title, index + 1);
    }

    if (description === "") {
      errors.push(
        `${where}: no description. Start the YouTube description with a sentence, or add a "description" override.`
      );
    } else if (length > maxDescriptionLength) {
      errors.push(
        `${where}: the description is ${length} characters; keep it to ${maxDescriptionLength}. ` +
          `Shorten the first paragraph${entry.description === undefined ? " on YouTube" : ""}: "${description}"`
      );
    }

    tiles.push({
      id: entry.id,
      title,
      description,
      titleSource: entry.title === undefined ? "YouTube" : "override",
      descriptionSource: entry.description === undefined ? "YouTube" : "override"
    });
  });

  if (errors.length > 0) {
    throw new Error(`The gallery was not updated:\n  ${errors.join("\n  ")}`);
  }

  return tiles;
}

// One tile's markup, matching the hand-written tiles it replaced. The first
// tile is the wide featured tile, and only its preview loads eagerly.
export function renderTile(tile, featured) {
  const id = tile.id;
  const title = escapeHtml(tile.title);

  return [
    "<li>",
    "  <a",
    `    class="video-tile${featured ? " featured" : ""}"`,
    `    href="https://youtu.be/${id}"`,
    `    data-video-id="${id}"`,
    `    data-video-title="${title}"`,
    `    aria-label="Play ${title} demo"`,
    "  >",
    '    <span class="video-thumb">',
    `      <img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" width="480" height="360" loading="${featured ? "eager" : "lazy"}" decoding="async">`,
    '      <span class="video-play" aria-hidden="true">',
    '        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>',
    "      </span>",
    "    </span>",
    '    <span class="video-text">',
    `      <span class="video-title">${title}</span>`,
    `      <span class="video-desc">${escapeHtml(tile.description)}</span>`,
    "    </span>",
    "  </a>",
    "</li>"
  ];
}

// Finds the generated region: the text between the end of the start marker
// comment and the end marker, plus the start marker's indentation.
export function findGallery(html) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);

  if (
    start === -1 ||
    end === -1 ||
    html.indexOf(startMarker, start + 1) !== -1 ||
    html.indexOf(endMarker, end + 1) !== -1
  ) {
    throw new Error(
      `index.html must contain exactly one "${startMarker} … -->" and one "${endMarker}".`
    );
  }

  const startClose = html.indexOf("-->", start);

  if (startClose === -1 || startClose > end) {
    throw new Error("The demo-videos start marker must come before the end marker.");
  }

  const lineStart = html.lastIndexOf("\n", start) + 1;
  const indent = html.slice(lineStart, start);

  if (!/^[ \t]*$/.test(indent)) {
    throw new Error("The demo-videos start marker must be on a line of its own.");
  }

  return { from: startClose + "-->".length, to: end, indent };
}

// Replaces only the region between the markers, keeping the file's own
// line endings and the markers' indentation.
export function replaceGallery(html, tiles) {
  const { from, to, indent } = findGallery(html);
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  const lines = tiles.flatMap((tile, index) => renderTile(tile, index === 0));
  const body = lines.map((line) => indent + line).join(eol);

  return html.slice(0, from) + eol + body + eol + indent + html.slice(to);
}

function attribute(tag, name) {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function textOf(markup, className) {
  return new RegExp(`<span class="${className}">([^<]*)</span>`).exec(markup)?.[1];
}

// Reads the tiles back from the generated region, as escaped HTML text.
export function readTiles(html) {
  const { from, to } = findGallery(html);
  const region = html.slice(from, to);
  const items = region.split("<li>").slice(1);

  return items.map((item) => {
    const link = /<a\b[^>]*>/.exec(item)?.[0] ?? "";
    const image = /<img\b[^>]*>/.exec(item)?.[0] ?? "";

    return {
      href: attribute(link, "href"),
      videoId: attribute(link, "data-video-id"),
      dataTitle: attribute(link, "data-video-title"),
      thumbnail: attribute(image, "src"),
      title: textOf(item, "video-title"),
      description: textOf(item, "video-desc")
    };
  });
}

// Offline check for CI: the tiles between the markers are the manifest's
// videos in order, each tile uses one ID throughout, and any overrides in the
// manifest are what the tiles show. Returns a list of problems.
export function checkGallery(html, entries) {
  const problems = [];
  const tiles = readTiles(html);

  tiles.forEach((tile, index) => {
    const where = `Tile ${index + 1}`;
    const hrefId = /^https:\/\/youtu\.be\/([\w-]{11})$/.exec(tile.href ?? "")?.[1];
    const thumbId = /^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\/hqdefault\.jpg$/.exec(
      tile.thumbnail ?? ""
    )?.[1];

    if (!hrefId || !thumbId || hrefId !== tile.videoId || thumbId !== tile.videoId) {
      problems.push(
        `${where}: href, data-video-id and thumbnail don't share one video ID ` +
          `(${tile.href}, ${tile.videoId}, ${tile.thumbnail}).`
      );
    }

    const entry = entries[index];

    if (!entry) {
      problems.push(`${where} (${tile.videoId}) is not in demo-videos.json.`);
      return;
    }

    if (entry.id !== tile.videoId) {
      problems.push(`${where} is ${tile.videoId}, but demo-videos.json has ${entry.id}.`);
      return;
    }

    if (entry.title !== undefined && tile.title !== escapeHtml(entry.title)) {
      problems.push(`${where} (${entry.id}): the title doesn't match its override.`);
    }

    if (tile.dataTitle !== tile.title) {
      problems.push(`${where} (${entry.id}): data-video-title doesn't match the visible title.`);
    }

    if (entry.description !== undefined && tile.description !== escapeHtml(entry.description)) {
      problems.push(`${where} (${entry.id}): the description doesn't match its override.`);
    }
  });

  entries.slice(tiles.length).forEach((entry, offset) => {
    problems.push(`Entry ${tiles.length + offset + 1} (${entry.id}) has no tile in index.html.`);
  });

  return problems;
}

// A short, human summary of what regenerating changed.
export function summariseChanges(before, after) {
  const lines = [];
  const count = Math.max(before.length, after.length);

  for (let index = 0; index < count; index += 1) {
    const where = `Tile ${index + 1}`;
    const old = before[index];
    const tile = after[index];

    if (!tile) {
      lines.push(`${where} removed (was ${old.videoId}).`);
      continue;
    }

    const title = escapeHtml(tile.title);
    const description = escapeHtml(tile.description);

    if (!old) {
      lines.push(`${where} added: ${tile.id}, "${tile.title}".`);
      continue;
    }

    if (old.videoId !== tile.id) {
      lines.push(`${where}: video ID ${old.videoId} → ${tile.id}.`);
    }

    if (old.title !== title) {
      lines.push(`${where}: title now "${tile.title}" (from ${tile.titleSource}).`);
    }

    if (old.description !== description) {
      lines.push(`${where}: description now from ${tile.descriptionSource}.`);
    }
  }

  return lines;
}
