import {
  canSearch,
  countSetCriteria,
  emptySearchCriteria,
  isEmptyCriteria,
  type SearchCriteria
} from "../../domain/search";
import {
  createSearchControl,
  createSearchRow,
  type SearchPanelContext,
  type SearchRow
} from "./search-row";

// Search's last row: Show photos, and Clear all, which asks first when more
// than one criterion is set.

type ActionsRowOptions = {
  onShowPhotos(criteria: SearchCriteria): void;
};

export function createActionsRow(
  context: SearchPanelContext,
  options: ActionsRowOptions
): SearchRow {
  const { documentRef } = context;
  let confirmingClear = false;

  function clearAll(): void {
    confirmingClear = false;
    context.setCriteria(emptySearchCriteria());
    context.update(context.defaultFocusKey());
  }

  return {
    activate(key) {
      const criteria = context.criteria();

      if (key === "show") {
        if (canSearch(criteria)) {
          options.onShowPhotos(criteria);
        } else {
          if (isEmptyCriteria(criteria)) {
            context.setMessage("Choose at least one filter first.");
          }
          context.update("show");
        }
        return true;
      }

      if (key === "clear") {
        if (countSetCriteria(criteria) > 1) {
          confirmingClear = true;
          context.update("keep");
        } else {
          clearAll();
        }
        return true;
      }

      if (key === "confirm-clear") {
        clearAll();
        return true;
      }

      if (key === "keep") {
        confirmingClear = false;
        context.update("clear");
        return true;
      }

      return false;
    },
    cancelModal() {
      confirmingClear = false;
      return "clear";
    },
    hide() {
      confirmingClear = false;
    },
    isModal: () => confirmingClear,
    lines() {
      if (confirmingClear) {
        return [["confirm-clear", "keep"]];
      }

      return [isEmptyCriteria(context.criteria()) ? ["show"] : ["show", "clear"]];
    },
    render() {
      const { controls, row } = createSearchRow(documentRef, null);

      row.className = "search-row search-actions";

      if (confirmingClear) {
        const question = documentRef.createElement("p");
        question.className = "search-confirm";
        question.textContent = "Clear all of these choices?";
        row.insertBefore(question, controls);
        controls.appendChild(
          createSearchControl(documentRef, "confirm-clear", "Clear all", "search-action")
        );
        controls.appendChild(
          createSearchControl(documentRef, "keep", "Keep them", "search-action")
        );
        return [row];
      }

      const show = createSearchControl(
        documentRef,
        "show",
        "Show photos",
        "search-action search-show"
      );

      if (!canSearch(context.criteria())) {
        show.setAttribute("aria-disabled", "true");
      }

      controls.appendChild(show);

      if (!isEmptyCriteria(context.criteria())) {
        controls.appendChild(
          createSearchControl(documentRef, "clear", "Clear all", "search-action")
        );
      }

      return [row];
    },
    show() {
      confirmingClear = false;
    },
    summary: () => null
  };
}
