export type FocusableElement = HTMLElement & {
  focus(): void;
};

export function getNextFocusIndex(currentIndex: number, count: number, offset: number): number {
  if (count <= 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return 0;
  }

  return Math.max(0, Math.min(count - 1, currentIndex + offset));
}

export function isInputElement(element: Element | null): boolean {
  return Boolean(element && element.tagName === "INPUT");
}

export function createFocusNavigator(
  getElements: () => FocusableElement[],
  getActiveElement: () => Element | null = () => document.activeElement
) {
  return {
    focusByOffset(offset: number) {
      const elements = getElements();
      const nextIndex = getNextFocusIndex(
        elements.indexOf(getActiveElement() as FocusableElement),
        elements.length,
        offset
      );
      const nextElement = elements[nextIndex];

      if (nextElement) {
        nextElement.focus();
      }
    },
    focusFirst() {
      const elements = getElements();

      const firstElement = elements[0];

      if (firstElement) {
        firstElement.focus();
      }
    }
  };
}
