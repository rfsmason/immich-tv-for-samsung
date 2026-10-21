import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Loads the shipped index.html body into the current happy-dom document so
// screen tests exercise the real markup, ids and focusable controls.
export function loadAppMarkup(documentRef: Document = document): Document {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);

  if (!body?.[1]) {
    throw new Error("index.html has no body markup.");
  }

  documentRef.body.innerHTML = body[1].replace(/<script[\s\S]*?<\/script>/gi, "");

  return documentRef;
}

export function pressKey(
  keyCode: number,
  target: EventTarget = document.activeElement || document
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true });

  Object.defineProperty(event, "keyCode", { value: keyCode });
  target.dispatchEvent(event);

  return event;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing test element: ${id}`);
  }

  return element as T;
}
