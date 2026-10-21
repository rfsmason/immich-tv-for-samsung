import type { Memory } from "../domain/home";

// Household-facing Memory titles and context lines, formatted from the
// Memory domain values the Immich client provides.

export function formatMemoryTitle(memory: Pick<Memory, "personName" | "year">): string {
  const year = Number.isFinite(memory.year) ? String(memory.year) : "";

  if (memory.personName && year) {
    return `${memory.personName}, ${year}`;
  }

  if (year) {
    return `Memory from ${year}`;
  }

  return "Memory";
}

// "On this day · 2020-10-15"
export function formatMemoryContext(memory: Pick<Memory, "kind" | "memoryAt">): string {
  const kind =
    memory.kind === "birthday"
      ? "Birthday"
      : memory.kind === "on-this-day"
        ? "On this day"
        : "Memory";

  return `${kind} · ${memory.memoryAt.slice(0, 10)}`;
}
