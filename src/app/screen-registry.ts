// Every mounted screen, keyed by a typed id, with one operation that leaves
// exactly one screen visible. Showing the chosen screen stays with the caller
// because each screen's show() takes different arguments. This is not a
// router: navigation decisions live in application composition (ADR 0012).

export type HideableScreen = {
  hide(): void;
};

export type ScreenRegistry<Id extends string> = {
  // Hides every registered screen except `id`.
  showOnly(id: Id): void;
};

export function createScreenRegistry<Id extends string>(
  screens: Record<Id, HideableScreen>
): ScreenRegistry<Id> {
  const ids = Object.keys(screens) as Id[];

  return {
    showOnly(id) {
      for (const otherId of ids) {
        if (otherId !== id) {
          screens[otherId].hide();
        }
      }
    }
  };
}
