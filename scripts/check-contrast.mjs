// Measures the theme's text, control-edge and focus colours against WCAG
// thresholds (rules in contrast-rules.mjs, ADR 0020). High contrast must meet
// its targets; the default theme only fails below 4.5:1 for body text, and
// otherwise reports, because its look is the user's choice. Default-theme
// ratios are measured on the solid app colour, not the picture behind it.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { checkContrast, findUntokenedColours } from "./contrast-rules.mjs";

const file = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "styles/main.css";
const css = await readFile(resolve(process.cwd(), file), "utf8");
const results = checkContrast(css);
const failures = results
  .flatMap((result) => result.failures)
  .concat(
    findUntokenedColours(css).map(
      (found) => `Theme colour outside the tokens (use one, ADR 0020): ${found}`
    )
  );

if (process.argv.includes("--report") || failures.length > 0) {
  for (const { contrast, name, normal } of results) {
    console.log(`${normal.toFixed(2).padStart(6)}  ${contrast.toFixed(2).padStart(6)}  ${name}`);
  }
}

if (failures.length > 0) {
  failures.forEach((failure) => console.error(failure));
  process.exit(1);
}

console.log(`Contrast check passed (${file}; default and high contrast).`);
