import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Apps2Samsung's catalogue entry fills in scripts/install-preset.js (ADR 0022)
// by replacing each exact `find` with its `replace`, a text value escaped for
// quotes and backslashes. This is the entry's user_settings, in that form.
const fields = [
  { key: "server_url", find: 'serverUrl: ""', replace: 'serverUrl: "{value}"' },
  { key: "api_key", find: 'apiKey: ""', replace: 'apiKey: "{value}"' }
];

function escapeText(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function install(values) {
  let script = await readFile(resolve(process.cwd(), "scripts/install-preset.js"), "utf8");

  for (const field of fields) {
    expect(script.split(field.find)).toHaveLength(2);
    script = script.replace(
      field.find,
      field.replace.replace("{value}", escapeText(values[field.key] ?? ""))
    );
  }

  const window = {};
  runInNewContext(script, { window });

  return window.IMMICH_TV_INSTALL_PRESET;
}

describe("install preset script", () => {
  it("is empty as shipped", async () => {
    expect(await install({})).toEqual({ apiKey: "", serverUrl: "" });
  });

  it("carries the installer's values, quotes and backslashes included", async () => {
    expect(
      await install({ api_key: 'key"with\\odd', server_url: "https://photos.example.test" })
    ).toEqual({ apiKey: 'key"with\\odd', serverUrl: "https://photos.example.test" });
  });
});
