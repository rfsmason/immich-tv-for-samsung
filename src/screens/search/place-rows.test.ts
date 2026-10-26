import { describe, expect, it } from "vitest";
import { readLetterJump, readPlaceRows } from "./place-rows";

describe("place picker rows", () => {
  it("offers Anywhere in the place above, below the countries", () => {
    const none = { country: null, state: null };

    expect(readPlaceRows("country", none, ["Exampleland"])).toEqual([
      { kind: "name", label: "Exampleland" }
    ]);
    expect(
      readPlaceRows("state", { country: "Exampleland", state: null }, ["Example County"])[0]
    ).toEqual({ kind: "anywhere", label: "Anywhere in Exampleland" });
    expect(
      readPlaceRows("city", { country: "Exampleland", state: "Example County" }, ["Exampleton"])[0]
    ).toEqual({ kind: "anywhere", label: "Anywhere in Example County" });
    expect(
      readPlaceRows("city", { country: "Sampleshire Isles", state: null }, ["Sampleport"])[0]
    ).toEqual({ kind: "anywhere", label: "Anywhere in Sampleshire Isles" });
  });

  it("jumps between first letters with CH, staying put at the ends", () => {
    const rows = readPlaceRows("state", { country: "Exampleland", state: null }, [
      "Abbey",
      "Acre",
      "Brook",
      "Cove",
      "Crest"
    ]);

    expect(readLetterJump(rows, 0, 1)).toBe(1);
    expect(readLetterJump(rows, 1, 1)).toBe(3);
    expect(readLetterJump(rows, 3, 1)).toBe(4);
    expect(readLetterJump(rows, 5, 1)).toBe(5);
    expect(readLetterJump(rows, 5, -1)).toBe(4);
    expect(readLetterJump(rows, 4, -1)).toBe(3);
    expect(readLetterJump(rows, 3, -1)).toBe(1);
    expect(readLetterJump(rows, 1, -1)).toBe(0);
    expect(readLetterJump(rows, 0, -1)).toBe(0);
  });
});
