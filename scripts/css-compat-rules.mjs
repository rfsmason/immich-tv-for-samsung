// The rules of the CSS compatibility check (check-css-compat.mjs): fails on
// CSS that Tizen 5.0 / Chromium 63 ignores or misreads. This is a
// deliberately small rule-level scanner, not a full CSS parser: it reads each
// `selector { declarations }` block (including those inside @media) and
// resolves a rule's display from any rule with the same selector.
// Versions come from MDN browser-compat-data.
import { relative } from "node:path";

const root = process.cwd();

const forbiddenProperties = [
  {
    pattern: /^inset(-block|-inline)?(-start|-end)?$/,
    reason: "inset needs Chrome 87; use top/right/bottom/left"
  },
  { pattern: /^aspect-ratio$/, reason: "aspect-ratio needs Chrome 88" },
  {
    pattern: /^(row-gap|column-gap)$/,
    reason: "unprefixed row-gap/column-gap need Chrome 66; use grid-row-gap/grid-column-gap"
  }
];
const forbiddenSelectors = [
  { pattern: /:focus-visible/, reason: ":focus-visible needs Chrome 86" },
  { pattern: /:is\(/, reason: ":is() needs Chrome 88" },
  { pattern: /:where\(/, reason: ":where() needs Chrome 88" },
  { pattern: /:has\(/, reason: ":has() needs Chrome 105" }
];
const forbiddenValues = [
  { pattern: /(^|[^a-z-])(clamp|min|max)\(/i, reason: "CSS clamp()/min()/max() need Chrome 79" }
];

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function readRules(source) {
  const rules = [];
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " ")
  );
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = pattern.exec(withoutComments))) {
    const selector = match[1].trim().replace(/\s+/g, " ");

    if (selector.startsWith("@") || /^(from|to|\d+%)$/.test(selector)) {
      continue;
    }

    const declarations = new Map();

    for (const declaration of match[2].split(";")) {
      const separator = declaration.indexOf(":");

      if (separator > 0) {
        declarations.set(
          declaration.slice(0, separator).trim().toLowerCase(),
          declaration.slice(separator + 1).trim()
        );
      }
    }

    rules.push({
      declarations,
      line: lineOf(withoutComments, match.index + match[0].length - match[2].length - 1),
      selector
    });
  }

  return rules;
}

// Chromium 63 ignores display: flex and grid on a <button> element (Chrome
// 83 lays out buttons as flex and grid containers). The button's content
// then falls back to inline text, so an icon and label can wrap apart. Lay
// a button's content out on an inner element instead: the rail and Settings
// buttons use an inner .button-row.
const buttonLayoutDisplay = /^(inline-)?(flex|grid)$/;
const buttonLayoutReason =
  "display: flex/grid on a <button> needs Chrome 83; lay out its content on an inner element (see .button-row)";

// Whether a selector list targets a button: the subject (last compound) of
// any selector in it is a `button` element or has a known button class.
export function targetsButton(selectorList, buttonClasses) {
  return selectorList.split(",").some((selector) => {
    const compounds = selector.trim().split(/\s*[>+~]\s*|\s+/);
    const subject = (compounds[compounds.length - 1] || "").replace(/::?[a-z-]+(\([^)]*\))?/gi, "");

    if (/^button(?=$|[.#[])/i.test(subject)) {
      return true;
    }

    return (subject.match(/\.[a-z0-9_-]+/gi) || []).some((name) =>
      buttonClasses.has(name.slice(1))
    );
  });
}

// Classes used on <button> elements: in markup, and in TS that creates a
// button and assigns its className or classList. Only literal class names
// are found; a class built at run time (a template value) is not.
export function readButtonClasses(htmlSources, tsSources) {
  const classes = new Set();
  const add = (value) =>
    value
      .split(/\s+/)
      .filter((name) => /^[a-z0-9_-]+$/i.test(name))
      .forEach((name) => classes.add(name));

  for (const html of htmlSources) {
    for (const match of html.matchAll(/<button\b[^>]*?\bclass="([^"]*)"/gis)) {
      add(match[1]);
    }
  }

  for (const ts of tsSources) {
    for (const match of ts.matchAll(/(\w+)\s*=\s*[\w.]+\.createElement\(\s*["']button["']\s*\)/g)) {
      const name = match[1];
      const assigned = new RegExp(
        `\\b${name}\\.(?:className\\s*=\\s*|classList\\.add\\()\\s*["'\`]([^"'\`]*)["'\`]`,
        "g"
      );

      for (const assignment of ts.matchAll(assigned)) {
        add(assignment[1].replace(/\$\{[^}]*\}/g, " "));
      }
    }
  }

  return classes;
}

export function checkCss(file, source, buttonClasses = new Set()) {
  const rules = readRules(source);
  const displayBySelector = new Map();
  const failures = [];
  const fail = (rule, reason) =>
    failures.push(`${relative(root, file)}:${rule.line} ${rule.selector}: ${reason}`);

  for (const rule of rules) {
    const display = rule.declarations.get("display");

    if (display) {
      displayBySelector.set(rule.selector, display);
    }
  }

  for (const rule of rules) {
    for (const { pattern, reason } of forbiddenSelectors) {
      if (pattern.test(rule.selector)) fail(rule, reason);
    }

    for (const [property, value] of rule.declarations) {
      for (const { pattern, reason } of forbiddenProperties) {
        if (pattern.test(property)) fail(rule, reason);
      }

      for (const { pattern, reason } of forbiddenValues) {
        if (!property.startsWith("--") && pattern.test(value.replace(/minmax\(/gi, "")))
          fail(rule, `${property}: ${reason}`);
      }
    }

    if (
      rule.declarations.has("backdrop-filter") &&
      !rule.declarations.has("background") &&
      !rule.declarations.has("background-color")
    ) {
      fail(
        rule,
        "backdrop-filter needs Chrome 76; add a solid background fallback in the same rule"
      );
    }

    if (
      buttonLayoutDisplay.test(rule.declarations.get("display") || "") &&
      targetsButton(rule.selector, buttonClasses)
    ) {
      fail(rule, buttonLayoutReason);
    }

    if (rule.declarations.has("gap")) {
      const display =
        rule.declarations.get("display") || displayBySelector.get(rule.selector) || "";

      if (/flex/.test(display)) {
        fail(rule, "flex gap needs Chrome 84; use adjacent-sibling margins");
      } else if (!rule.declarations.has("grid-gap")) {
        fail(
          rule,
          "unprefixed grid gap needs Chrome 66; add an equal grid-gap fallback in the same rule"
        );
      }
    }
  }

  return failures;
}
