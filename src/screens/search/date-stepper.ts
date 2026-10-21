import { clampCalendarDay, daysInMonth, type CalendarDate } from "../../domain/search";

// The inline date stepper's model (ADR 0014): day, month and year columns in
// UK order plus a Clear column. Up raises the focused value and Down lowers it.
// Days and months wrap; years stop at the library's bounds.

export type DateStepperColumn = "day" | "month" | "year" | "clear";

export const dateStepperColumns: DateStepperColumn[] = ["day", "month", "year", "clear"];

export type DateStepperState = {
  column: DateStepperColumn;
  date: CalendarDate;
  maxYear: number;
  minYear: number;
};

export function openDateStepper(
  date: CalendarDate,
  bounds: { maxYear: number; minYear: number }
): DateStepperState {
  const year = Math.min(bounds.maxYear, Math.max(bounds.minYear, date.year));

  return {
    column: "day",
    date: clampCalendarDay({ ...date, year }),
    maxYear: bounds.maxYear,
    minYear: bounds.minYear
  };
}

export function moveDateStepperColumn(state: DateStepperState, offset: number): DateStepperState {
  const index = dateStepperColumns.indexOf(state.column) + offset;
  const column = dateStepperColumns[Math.max(0, Math.min(dateStepperColumns.length - 1, index))];

  return { ...state, column: column || state.column };
}

export function stepDateStepper(state: DateStepperState, offset: number): DateStepperState {
  const { date } = state;

  if (state.column === "day") {
    const days = daysInMonth(date.year, date.month);

    return { ...state, date: { ...date, day: wrap(date.day + offset, days) } };
  }

  if (state.column === "month") {
    return {
      ...state,
      date: clampCalendarDay({ ...date, month: wrap(date.month + offset, 12) })
    };
  }

  if (state.column === "year") {
    const year = Math.min(state.maxYear, Math.max(state.minYear, date.year + offset));

    return { ...state, date: clampCalendarDay({ ...date, year }) };
  }

  return state;
}

// 1-based wrap: 0 becomes `size`, `size + 1` becomes 1.
function wrap(value: number, size: number): number {
  return ((((value - 1) % size) + size) % size) + 1;
}
