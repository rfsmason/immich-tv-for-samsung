import type { Person } from "../domain/home";

// A person's household-facing name. Unnamed people keep a neutral label;
// naming them stays in Immich.
export function formatPersonName(person: Pick<Person, "name">): string {
  return person.name || "Unnamed person";
}
