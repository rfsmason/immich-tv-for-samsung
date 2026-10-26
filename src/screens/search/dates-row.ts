import type { AlbumService } from "../../app/album-service";
import type { TimelineBucket } from "../../domain/album";
import {
  setSearchMediaType,
  setTakenFrom,
  setTakenTo,
  type CalendarDate
} from "../../domain/search";
import { readArrowDirection, remoteKeys } from "../../platform/tizen/keys";
import { shortMonthNames } from "../../presentation/date-labels";
import {
  formatSearchDate,
  formatSearchTakenSummary,
  searchMediaTypeLabels
} from "../../presentation/search-labels";
import { readDropdownKey } from "../dropdown";
import { assetTypeKey, createAssetTypeField } from "./asset-type-field";
import {
  moveDateStepperColumn,
  openDateStepper,
  stepDateStepper,
  type DateStepperColumn,
  type DateStepperState
} from "./date-stepper";
import {
  createSearchControl,
  createSearchRow,
  type SearchPanelContext,
  type SearchRow
} from "./search-row";

// Search's Taken row: From and To dates, each edited with an inline stepper
// that takes over the remote until OK sets it or Back cancels, then the
// Asset type field, whose list drops down beneath it (asset-type-field.ts).

// Year bounds when the library's timeline span is not known.
const fallbackYearSpan = 100;

type DateField = "from" | "to";

type DatesRowOptions = {
  service: Pick<AlbumService, "loadTimelineBuckets">;
  today(): CalendarDate;
};

type Bounds = { earliest: CalendarDate | null; minYear: number };

export function createDatesRow(context: SearchPanelContext, options: DatesRowOptions): SearchRow {
  const { documentRef } = context;
  let bounds: Bounds | null = null;
  let boundsRequested = false;
  // Advanced only by reset() (a connection change). The library's span is
  // session data, so leaving Search does not discard it.
  let connectionEpoch = 0;
  let editing: { field: DateField; stepper: DateStepperState } | null = null;
  const assetType = createAssetTypeField();

  function openAssetType(): void {
    context.update(assetType.open(context.criteria().mediaType));
  }

  // The library's oldest photo bounds the year column and seeds From. One
  // request per session; without it, the last hundred years are offered.
  function loadBounds(): void {
    if (boundsRequested) {
      return;
    }

    boundsRequested = true;
    const epoch = connectionEpoch;

    options.service
      .loadTimelineBuckets("newest-first")
      .then((buckets) => {
        if (epoch === connectionEpoch) {
          bounds = readBounds(buckets);
        }
      })
      .catch(() => {
        // Fallback bounds still allow every date to be set; the next visit
        // to Search tries again.
        if (epoch === connectionEpoch) {
          boundsRequested = false;
        }
      });
  }

  function yearBounds(): { maxYear: number; minYear: number } {
    const maxYear = options.today().year;
    const minYear = bounds ? Math.min(bounds.minYear, maxYear) : maxYear - fallbackYearSpan;

    return { maxYear, minYear };
  }

  function openStepper(field: DateField): void {
    const criteria = context.criteria();
    const current = field === "from" ? criteria.takenFrom : criteria.takenTo;
    const initial =
      current ||
      (field === "to"
        ? options.today()
        : bounds?.earliest || { day: 1, month: 1, year: options.today().year });

    editing = { field, stepper: openDateStepper(initial, yearBounds()) };
    context.update("stepper:day");
  }

  function closeStepper(apply: boolean, value?: CalendarDate | null): void {
    const closing = editing;

    if (!closing) {
      return;
    }

    editing = null;

    if (apply) {
      const date = value === undefined ? closing.stepper.date : value;
      context.setCriteria(
        closing.field === "from"
          ? setTakenFrom(context.criteria(), date)
          : setTakenTo(context.criteria(), date)
      );
    }

    context.update(closing.field);
  }

  // A Settings-style field: a small label above a normal-height control.
  function createDateControl(
    key: DateField,
    label: string,
    date: CalendarDate | null
  ): HTMLElement {
    const field = documentRef.createElement("div");
    const name = documentRef.createElement("span");
    const control = createSearchControl(documentRef, key, formatSearchDate(date), "search-date");

    field.className = "search-field";
    name.className = "field-label";
    name.textContent = label;
    control.setAttribute("aria-label", `${label}: ${formatSearchDate(date)}`);

    if (editing?.field === key) {
      control.setAttribute("data-editing", "true");
    }

    field.appendChild(name);
    field.appendChild(control);

    return field;
  }

  function renderStepper(open: NonNullable<typeof editing>): HTMLElement {
    const stepper = documentRef.createElement("div");
    const { date } = open.stepper;
    const values: Record<DateStepperColumn, string> = {
      clear: "Clear",
      day: String(date.day),
      month: shortMonthNames[date.month - 1] || "",
      year: String(date.year)
    };

    stepper.className = "search-stepper";
    stepper.setAttribute("role", "group");
    stepper.setAttribute("aria-label", open.field === "from" ? "Edit From date" : "Edit To date");

    (["day", "month", "year", "clear"] as DateStepperColumn[]).forEach((column) => {
      const control = createSearchControl(
        documentRef,
        `stepper:${column}`,
        values[column],
        "search-stepper-column"
      );

      control.setAttribute("data-column", column);

      if (column !== "clear") {
        control.setAttribute("aria-label", `${column}: ${values[column]}. Up or Down to change`);
      } else {
        control.setAttribute("aria-label", "Clear this date to Any date");
      }

      stepper.appendChild(control);
    });

    const hint = documentRef.createElement("p");
    hint.className = "search-stepper-hint";
    hint.textContent = "Up or Down to change · OK to set · Back to cancel";
    stepper.appendChild(hint);

    return stepper;
  }

  return {
    activate(key) {
      if (key === "from" || key === "to") {
        openStepper(key);
        return true;
      }

      if (key === assetTypeKey) {
        openAssetType();
        return true;
      }

      return false;
    },
    arrive(key) {
      if (key !== assetTypeKey) {
        return false;
      }

      openAssetType();
      return true;
    },
    handleModalKey(event, keyCode) {
      const direction = readArrowDirection(keyCode);

      event.preventDefault();

      if (assetType.isOpen()) {
        const result = assetType.handleKey(readDropdownKey(keyCode));

        if ("focus" in result) {
          context.update(result.focus);
        } else {
          if (result.chosen) {
            context.setCriteria(setSearchMediaType(context.criteria(), result.chosen));
          }
          context.update(assetTypeKey);
        }

        return true;
      }

      const open = editing!;

      if (keyCode === remoteKeys.back) {
        closeStepper(false);
        return true;
      }

      if (keyCode === remoteKeys.enter) {
        closeStepper(true, open.stepper.column === "clear" ? null : undefined);
        return true;
      }

      if (direction === "left" || direction === "right") {
        open.stepper = moveDateStepperColumn(open.stepper, direction === "left" ? -1 : 1);
      } else if (direction === "up" || direction === "down") {
        open.stepper = stepDateStepper(open.stepper, direction === "up" ? 1 : -1);
      } else {
        return true;
      }

      context.update(`stepper:${open.stepper.column}`);
      return true;
    },
    hide() {
      editing = null;
      assetType.close();
    },
    isModal: () => editing !== null || assetType.isOpen(),
    lines() {
      if (assetType.isOpen()) {
        return assetType.optionKeys().map((key) => [key]);
      }

      return editing
        ? [["day", "month", "year", "clear"].map((column) => `stepper:${column}`)]
        : [["from", "to", assetTypeKey]];
    },
    render() {
      const { controls, row } = createSearchRow(documentRef, null);
      const criteria = context.criteria();

      controls.appendChild(createDateControl("from", "Taken from", criteria.takenFrom));
      controls.appendChild(createDateControl("to", "Taken to", criteria.takenTo));
      controls.appendChild(assetType.render(documentRef, criteria.mediaType));

      return editing ? [row, renderStepper(editing)] : [row];
    },
    reset() {
      bounds = null;
      boundsRequested = false;
      connectionEpoch += 1;
    },
    show() {
      editing = null;
      assetType.close();
      loadBounds();
    },
    summary() {
      const criteria = context.criteria();
      const parts = [
        formatSearchTakenSummary(criteria.takenFrom, criteria.takenTo),
        criteria.mediaType === "all" ? null : searchMediaTypeLabels[criteria.mediaType]
      ].filter((part): part is string => part !== null);

      return parts.join(" · ") || null;
    }
  };
}

function readBounds(buckets: TimelineBucket[]): Bounds | null {
  let earliest: CalendarDate | null = null;

  for (const bucket of buckets) {
    const match = /^(\d{4})-(\d{2})/.exec(bucket.timeBucket);

    if (!match || bucket.assetCount <= 0) {
      continue;
    }

    const date = { day: 1, month: Number(match[2]), year: Number(match[1]) };

    if (
      !earliest ||
      date.year < earliest.year ||
      (date.year === earliest.year && date.month < earliest.month)
    ) {
      earliest = date;
    }
  }

  return earliest ? { earliest, minYear: earliest.year } : null;
}
