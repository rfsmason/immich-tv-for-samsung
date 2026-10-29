// The display theme (ADR 0020): high contrast is an attribute on the root
// element that swaps the stylesheet's colour tokens; nothing else changes.

export const contrastAttribute = "data-contrast";

export function applyContrastTheme(documentRef: Document, highContrast: boolean): void {
  const root = documentRef.documentElement;

  if (highContrast) {
    root.setAttribute(contrastAttribute, "high");
  } else {
    root.removeAttribute(contrastAttribute);
  }
}
