import type { SearchPlaceLevel, SearchPlaceParent } from "../../domain/search";

// The place picker's rows at one level: below the countries, "Anywhere in
// <place>" first, to choose the level above, then the names.

export type PlaceRow = { kind: "anywhere" | "name"; label: string };

export function readPlaceRows(
  level: SearchPlaceLevel,
  parent: SearchPlaceParent,
  names: string[]
): PlaceRow[] {
  const rows = names.map((label): PlaceRow => ({ kind: "name", label }));
  const within = level === "country" ? null : parent.state || parent.country;

  return within
    ? [{ kind: "anywhere", label: `Anywhere in ${within}` } as PlaceRow].concat(rows)
    : rows;
}

// The row CH+ or CH- moves to: the first name of the next (step 1) or
// previous (step -1) first letter. From inside a letter, CH- goes to that
// letter's first name. The ends stay put.
export function readLetterJump(rows: PlaceRow[], index: number, step: 1 | -1): number {
  const letter = (row: PlaceRow | undefined) =>
    row && row.kind === "name" ? row.label.charAt(0).toLocaleUpperCase() : "";
  const startOf = (at: number) => {
    let first = at;

    while (
      first > 0 &&
      rows[first - 1]!.kind === "name" &&
      letter(rows[first - 1]) === letter(rows[at])
    ) {
      first -= 1;
    }

    return first;
  };

  if (step === 1) {
    for (let next = index + 1; next < rows.length; next += 1) {
      if (letter(rows[next]) !== letter(rows[index])) {
        return next;
      }
    }

    return index;
  }

  const first = startOf(index);

  return first < index || first === 0 ? first : startOf(first - 1);
}
