import { requireElement, type SettingsSection } from "./settings-section";
import type { SupportPage } from "./support-qr";

// Settings › Support Us (ADR 0021): the tip page as a QR code and a short
// address, the suggested tips, and an honour-based "already supported"
// toggle that changes only the splash's line. The TV never contacts the tip
// page. Sideload builds only, so the button and panel are built here rather
// than written into index.html; a store build has no trace of them.

const svgNamespace = "http://www.w3.org/2000/svg";

const tips = ["£5 · A coffee", "£10 · Lunch", "£20 · Dinner"];

export function createSupportSection(documentRef: Document, page: SupportPage): SettingsSection {
  const button = createRailButton(documentRef);
  const { panel, supporter } = createPanel(documentRef, page);

  // After Ambient, before the Save and Exit actions.
  const actions = documentRef.querySelector(".settings-nav-actions");
  actions?.parentNode?.insertBefore(button, actions);
  const unsaved = requireElement(documentRef, "settings-panel-unsaved");
  unsaved.parentNode?.insertBefore(panel, unsaved);

  return {
    button,
    firstControl: () => supporter,
    id: "support",
    panel,
    readAppSettings: () => ({ supporter: supporter.checked }),
    showAppSettings(settings) {
      supporter.checked = settings.supporter;
    },
    snapshot: () => ({ supporter: supporter.checked })
  };
}

function createRailButton(documentRef: Document): HTMLButtonElement {
  const button = documentRef.createElement("button");
  const row = documentRef.createElement("span");
  const label = documentRef.createElement("span");

  button.id = "settings-section-support";
  button.className = "focusable settings-section-button";
  button.type = "button";
  button.setAttribute("data-settings-section", "support");
  button.setAttribute("aria-controls", "settings-panel-support");
  button.setAttribute("aria-selected", "false");
  row.className = "button-row";
  label.className = "button-row-label";
  label.textContent = "Support Us";
  row.appendChild(
    createSvg(
      documentRef,
      "settings-section-icon",
      "0 0 24 24",
      "M12 21l-1.4-1.3C5.4 15 2 11.9 2 8.4 2 5.6 4.2 3.5 7 3.5c1.9 0 3.7 1 5 2.5 1.3-1.5 3.1-2.5 5-2.5 2.8 0 5 2.1 5 4.9 0 3.5-3.4 6.6-8.6 11.3L12 21z"
    )
  );
  row.appendChild(label);
  button.appendChild(row);

  return button;
}

function createPanel(
  documentRef: Document,
  page: SupportPage
): { panel: HTMLElement; supporter: HTMLInputElement } {
  const panel = documentRef.createElement("section");
  const copy = documentRef.createElement("div");
  const heading = documentRef.createElement("h2");
  const list = documentRef.createElement("ul");

  panel.id = "settings-panel-support";
  panel.className = "settings-section-panel support-panel";
  panel.setAttribute("aria-labelledby", "settings-support-title");
  panel.hidden = true;
  copy.className = "support-copy";
  heading.id = "settings-support-title";
  heading.className = "support-title";
  heading.textContent = "Support Immich TV";
  copy.appendChild(heading);
  copy.appendChild(
    createText(
      documentRef,
      "p",
      "support-intro",
      "Immich TV is free and always will be. If you enjoy it, you can buy me a coffee. Tips are optional and don't unlock anything."
    )
  );
  list.className = "support-tips";
  tips.forEach((tip) => list.appendChild(createText(documentRef, "li", "", tip)));
  copy.appendChild(list);
  copy.appendChild(createText(documentRef, "p", "support-any", "Any amount is appreciated."));
  panel.appendChild(copy);
  panel.appendChild(createQrTile(documentRef, page));
  const supporter = createSupporterChoice(documentRef, panel);

  return { panel, supporter };
}

// The QR code is media, like a photo: black modules on a white tile in every
// theme, so phones read it whatever the theme. It is not a control.
function createQrTile(documentRef: Document, page: SupportPage): HTMLElement {
  const figure = documentRef.createElement("div");
  const size = page.qr.size;
  const qr = createSvg(documentRef, "support-qr", `0 0 ${size} ${size}`, page.qr.path);

  figure.className = "support-qr-figure";
  qr.setAttribute("shape-rendering", "crispEdges");
  figure.appendChild(qr);
  figure.appendChild(createText(documentRef, "p", "support-scan", "Scan with your phone"));
  figure.appendChild(createText(documentRef, "p", "support-address", page.label));

  return figure;
}

// The toggle in the Settings On/Off pattern; the panel's only control.
function createSupporterChoice(documentRef: Document, parent: HTMLElement): HTMLInputElement {
  const label = documentRef.createElement("label");
  const input = documentRef.createElement("input");
  const text = documentRef.createElement("span");

  label.className = "field choice-field";
  input.id = "support-supporter";
  input.className = "focusable";
  input.name = "supporter";
  input.type = "checkbox";
  text.appendChild(
    createText(documentRef, "span", "field-label", "I've already supported Immich TV")
  );
  text.appendChild(
    createText(
      documentRef,
      "span",
      "field-hint",
      "Changes the start screen's message to a thank-you."
    )
  );
  label.appendChild(input);
  label.appendChild(text);
  parent.appendChild(label);

  return input;
}

function createText<K extends "li" | "p" | "span">(
  documentRef: Document,
  tagName: K,
  className: string,
  text: string
): HTMLElementTagNameMap[K] {
  const element = documentRef.createElement(tagName);

  if (className) {
    element.className = className;
  }

  element.textContent = text;

  return element;
}

function createSvg(
  documentRef: Document,
  className: string,
  viewBox: string,
  pathData: string
): SVGSVGElement {
  const svg = documentRef.createElementNS(svgNamespace, "svg");
  const path = documentRef.createElementNS(svgNamespace, "path");

  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  path.setAttribute("d", pathData);
  svg.appendChild(path);

  return svg;
}
