import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

// Machine-specific Tizen settings (the TV's SDB address, its target name and
// the signing certificate profile) identify one developer's TV and signing
// setup, so they come from the environment or an untracked .env.tizen file,
// never from source. See .env.tizen.example.
export function loadTizenEnv(root = process.cwd()) {
  const file = resolve(root, ".env.tizen");

  if (existsSync(file)) {
    loadEnvFile(file);
  }
}

export function requireTizenEnv(names) {
  const missing = names.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Set ${missing.join(", ")} in the environment or in .env.tizen (copy .env.tizen.example).`
    );
  }

  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}
