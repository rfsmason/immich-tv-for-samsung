import { describe, expect, it } from "vitest";
import {
  addSearchPerson,
  calendarDateFromLocal,
  canSearch,
  clampCalendarDay,
  compareCalendarDates,
  countSetCriteria,
  daysInMonth,
  emptySearchCriteria,
  hasValidDateRange,
  isEmptyCriteria,
  isLeapYear,
  isValidCalendarDate,
  maxSearchPeople,
  nextCalendarDate,
  removeSearchPerson,
  setSearchPeople,
  setTakenFrom,
  setTakenTo
} from "./search";

const date = (year: number, month: number, day: number) => ({ day, month, year });
const mum = { id: "mum", name: "Mum" };
const dad = { id: "dad", name: "Dad" };

describe("search criteria", () => {
  it("starts empty and cannot search until a criterion is set", () => {
    const criteria = emptySearchCriteria();

    expect(isEmptyCriteria(criteria)).toBe(true);
    expect(countSetCriteria(criteria)).toBe(0);
    expect(canSearch(criteria)).toBe(false);
  });

  it("can search on people alone, a single date, or both", () => {
    expect(canSearch(addSearchPerson(emptySearchCriteria(), mum))).toBe(true);
    expect(canSearch(setTakenFrom(emptySearchCriteria(), date(2020, 1, 1)))).toBe(true);
    expect(canSearch(setTakenTo(emptySearchCriteria(), date(2020, 1, 1)))).toBe(true);

    const all = setTakenTo(
      setTakenFrom(addSearchPerson(emptySearchCriteria(), mum), date(2020, 1, 1)),
      date(2020, 12, 31)
    );
    expect(countSetCriteria(all)).toBe(3);
    expect(canSearch(all)).toBe(true);
  });

  it("allows a one-day range and rejects From after To without swapping", () => {
    const sameDay = setTakenTo(
      setTakenFrom(emptySearchCriteria(), date(2024, 2, 29)),
      date(2024, 2, 29)
    );
    expect(hasValidDateRange(sameDay)).toBe(true);

    const reversed = setTakenTo(
      setTakenFrom(emptySearchCriteria(), date(2021, 1, 2)),
      date(2021, 1, 1)
    );
    expect(hasValidDateRange(reversed)).toBe(false);
    expect(canSearch(reversed)).toBe(false);
    expect(reversed.takenFrom).toEqual(date(2021, 1, 2));
  });

  it("adds people once, in order, removes them, and caps the selection", () => {
    let criteria = addSearchPerson(addSearchPerson(emptySearchCriteria(), mum), dad);
    criteria = addSearchPerson(criteria, mum);
    expect(criteria.people.map((person) => person.id)).toEqual(["mum", "dad"]);

    criteria = removeSearchPerson(criteria, "mum");
    expect(criteria.people).toEqual([dad]);

    const many = Array.from({ length: maxSearchPeople + 3 }, (_, index) => ({
      id: `p${index}`,
      name: null
    }));
    expect(setSearchPeople(criteria, many).people).toHaveLength(maxSearchPeople);
  });

  it("never changes the criteria it is given", () => {
    const original = emptySearchCriteria();
    const from = date(2020, 5, 5);

    const next = setTakenFrom(addSearchPerson(original, mum), from);
    from.day = 9;

    expect(original).toEqual(emptySearchCriteria());
    expect(next.takenFrom).toEqual(date(2020, 5, 5));
    expect(setTakenFrom(next, null).takenFrom).toBeNull();
  });
});

describe("calendar dates", () => {
  it("knows leap years and month lengths", () => {
    expect([1900, 2000, 2023, 2024].map(isLeapYear)).toEqual([false, true, false, true]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("validates dates against their month", () => {
    expect(isValidCalendarDate(date(2024, 2, 29))).toBe(true);
    expect(isValidCalendarDate(date(2023, 2, 29))).toBe(false);
    expect(isValidCalendarDate(date(2026, 13, 1))).toBe(false);
    expect(isValidCalendarDate(date(2026, 4, 31))).toBe(false);
    expect(isValidCalendarDate(date(2026, 1, 0))).toBe(false);
  });

  it("steps to the next day across month, year and leap-day boundaries", () => {
    expect(nextCalendarDate(date(2026, 10, 16))).toEqual(date(2026, 10, 17));
    expect(nextCalendarDate(date(2026, 4, 30))).toEqual(date(2026, 5, 1));
    expect(nextCalendarDate(date(2024, 2, 28))).toEqual(date(2024, 2, 29));
    expect(nextCalendarDate(date(2024, 2, 29))).toEqual(date(2024, 3, 1));
    expect(nextCalendarDate(date(2023, 2, 28))).toEqual(date(2023, 3, 1));
    expect(nextCalendarDate(date(2026, 12, 31))).toEqual(date(2027, 1, 1));
  });

  it("orders dates and keeps a day valid when its month changes", () => {
    expect(compareCalendarDates(date(2020, 1, 1), date(2019, 12, 31))).toBeGreaterThan(0);
    expect(compareCalendarDates(date(2020, 3, 1), date(2020, 3, 1))).toBe(0);
    expect(compareCalendarDates(date(2020, 2, 1), date(2020, 3, 1))).toBeLessThan(0);
    expect(clampCalendarDay(date(2023, 2, 31))).toEqual(date(2023, 2, 28));
    expect(clampCalendarDay(date(2024, 2, 31))).toEqual(date(2024, 2, 29));
  });

  it("reads today's local calendar date", () => {
    expect(calendarDateFromLocal(new Date(2026, 9, 16, 23, 59))).toEqual(date(2026, 10, 16));
  });
});
