// Regenerates the website's demo video tiles from website/demo-videos.json,
// or with --check verifies them offline. See website/README.md.
import { run } from "./website-videos/run.mjs";

try {
  const lines = await run({ root: process.cwd(), check: process.argv.includes("--check") });
  console.log(lines.join("\n"));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
