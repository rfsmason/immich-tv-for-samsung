import { describe, expect, it } from "vitest";
import { moveDateStepperColumn, openDateStepper, stepDateStepper } from "./date-stepper";

const bounds = { maxYear: 2026, minYear: 2001 };
const date = (year: number, month: number, day: number) => ({ day, month, year });

describe("date stepper", () => {
  it("opens on the day column inside the year bounds", () => {
    expect(openDateStepper(date(2026, 10, 16), bounds)).toEqual({
      column: "day",
      date: date(2026, 10, 16),
      ...bounds
    });
    expect(openDateStepper(date(1990, 2, 29), bounds).date).toEqual(date(2001, 2, 28));
  });

  it("moves between day, month, year and Clear without leaving the stepper", () => {
    let state = openDateStepper(date(2026, 10, 16), bounds);

    state = moveDateStepperColumn(state, -1);
    expect(state.column).toBe("day");
    state = moveDateStepperColumn(moveDateStepperColumn(moveDateStepperColumn(state, 1), 1), 1);
    expect(state.column).toBe("clear");
    expect(moveDateStepperColumn(state, 1).column).toBe("clear");
    expect(stepDateStepper(state, 1)).toBe(state);
  });

  it("wraps days within the month's real length, including leap years", () => {
    const leap = openDateStepper(date(2024, 2, 29), bounds);

    expect(stepDateStepper(leap, 1).date).toEqual(date(2024, 2, 1));
    expect(stepDateStepper(openDateStepper(date(2023, 2, 28), bounds), 1).date).toEqual(
      date(2023, 2, 1)
    );
    expect(stepDateStepper(openDateStepper(date(2026, 4, 1), bounds), -1).date).toEqual(
      date(2026, 4, 30)
    );
  });

  it("wraps months and keeps the day valid", () => {
    const january = { ...openDateStepper(date(2026, 1, 31), bounds), column: "month" as const };

    expect(stepDateStepper(january, 1).date).toEqual(date(2026, 2, 28));
    expect(stepDateStepper(january, -1).date).toEqual(date(2026, 12, 31));
    expect(stepDateStepper({ ...january, date: date(2024, 1, 31) }, 1).date).toEqual(
      date(2024, 2, 29)
    );
  });

  it("stops years at the bounds and fixes 29 February in a non-leap year", () => {
    const year = { ...openDateStepper(date(2024, 2, 29), bounds), column: "year" as const };

    expect(stepDateStepper(year, 1).date).toEqual(date(2025, 2, 28));
    expect(stepDateStepper({ ...year, date: date(2026, 5, 5) }, 1).date.year).toBe(2026);
    expect(stepDateStepper({ ...year, date: date(2001, 5, 5) }, -1).date.year).toBe(2001);
  });
});
