// Fails on CSS that Tizen 5.0 / Chromium 63 ignores or misreads; the rules
// live in css-compat-rules.mjs. Button classes are read from index.html and
// the TypeScript that creates buttons.
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkCss, readButtonClasses } from "./css-compat-rules.mjs";

const root = process.cwd();
const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["styles/main.css"];

async function readTsSources(directory) {
  const sources = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      sources.push(...(await readTsSources(path)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      sources.push(await readFile(path, "utf8"));
    }
  }

  return sources;
}

async function main() {
  const buttonClasses = readButtonClasses(
    [await readFile(resolve(root, "index.html"), "utf8")],
    await readTsSources(resolve(root, "src"))
  );
  const failures = [];

  for (const file of files) {
    const path = resolve(root, file);

    failures.push(...checkCss(path, await readFile(path, "utf8"), buttonClasses));
  }

  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    process.exit(1);
  }

  console.log(`CSS compatibility check passed (${files.join(", ")}).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
