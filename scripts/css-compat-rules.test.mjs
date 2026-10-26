import { describe, expect, it } from "vitest";
import { checkCss, readButtonClasses, targetsButton } from "./css-compat-rules.mjs";

// Chromium 63 ignores display: flex/grid on a <button> (Chrome 83+).
describe("button layout check", () => {
  const html = `
    <button class="focusable rail-item" type="button"><span class="button-row">Home</span></button>
    <button
      id="multi-line"
      class="focusable icon-action"
      type="button"
    ></button>
    <div class="not-a-button"></div>`;
  const ts = `
    const tile = documentRef.createElement("button");
    tile.className = "focusable album-tile";
    const chip = documentRef.createElement("button");
    chip.className = \`focusable \${className}\`;
    chip.classList.add("picked");
    const box = documentRef.createElement("div");
    box.className = "plain-box";`;
  const classes = readButtonClasses([html], [ts]);

  it("collects the classes used on buttons in markup and in code", () => {
    expect([...classes].sort()).toEqual(
      ["album-tile", "focusable", "icon-action", "picked", "rail-item"].sort()
    );
  });

  it("targets a selector whose subject is a button", () => {
    expect(targetsButton("button.rail-item", classes)).toBe(true);
    expect(targetsButton(".nav .album-tile:focus", classes)).toBe(true);
    expect(targetsButton(".plain-box, button", classes)).toBe(true);
    // A button's inner row, or something inside a button, is not a button.
    expect(targetsButton(".rail-item .button-row", classes)).toBe(false);
    expect(targetsButton(".icon-action > svg", classes)).toBe(false);
    expect(targetsButton(".not-a-button", classes)).toBe(false);
  });

  it("fails flex and grid display on a button and points at the inner row", () => {
    const failures = checkCss(
      "fixture.css",
      `button.rail-item { display: flex; }
       .album-tile { display: inline-grid; }
       .picked { display: grid; }
       .icon-action:focus { display: inline-flex; }`,
      classes
    );

    expect(failures).toHaveLength(4);
    failures.forEach((failure) => expect(failure).toContain("see .button-row"));
  });

  it("passes block display on buttons and flex or grid on other elements", () => {
    expect(
      checkCss(
        "fixture.css",
        `button.rail-item { display: block; }
         .rail-item .button-row { display: flex; }
         .not-a-button { display: grid; grid-gap: 4px; gap: 4px; }
         .album-tile { display: inline-block; }`,
        classes
      )
    ).toEqual([]);
  });
});
