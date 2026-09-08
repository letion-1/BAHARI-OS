import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
  WorkbookCellFill,
} from "../source-types";

import type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserResult,
  WorkbookParser,
} from "./types";

const PARSER_ID = "monthly-calendar-v1";

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

type CalendarDay = {
  date: string;
  status: AvailabilityStatus;
  rawValue: SerializableCellValue;
  sourceSheet: string;
  sourceCell: string;
  sourceRow: number;
  sourceColumn: number;
  fill: WorkbookCellFill | undefined;
};

export const monthlyCalendarParser: WorkbookParser = {
  id: PARSER_ID,
  layout: "monthly_calendar",

  detect(workbook: ParsedWorkbook): ParserDetection {
    const sheet = workbook.sheets.find((candidate) =>
      Boolean(findMonthYear(candidate, workbook))
    );

    return {
      layout: "monthly_calendar",
      confidence: sheet ? 0.9 : 0,
      parserId: PARSER_ID,
      reasons: sheet
        ? ["Found month/year calendar headings and numbered day cells."]
        : [],
      sheetName: sheet?.name ?? workbook.sheets[0]?.name ?? null,
    };
  },

  parse(
    workbook: ParsedWorkbook,
    detection: ParserDetection
  ): ParserResult {
    const warnings: string[] = [];
    const days: CalendarDay[] = [];

    for (const sheet of workbook.sheets) {
      const monthYear = findMonthYear(sheet, workbook);

      if (!monthYear) {
        continue;
      }

      const seenDates = new Set<string>();

      for (const cell of sheet.cells) {
        const day = parseCalendarDay(cell.value);

        if (day === null) {
          continue;
        }

        const date = toIsoDate(
          monthYear.year,
          monthYear.month,
          day
        );

        if (!date || seenDates.has(date)) {
          continue;
        }

        const status = statusFromFill(cell.fill);

        if (status === "unknown") {
          continue;
        }

        seenDates.add(date);
        days.push({
          date,
          status,
          rawValue: cell.value,
          sourceSheet: sheet.name,
          sourceCell: cell.address,
          sourceRow: cell.row,
          sourceColumn: cell.column,
          fill: cell.fill,
        });
      }

      if (seenDates.size === 0) {
        warnings.push(
          `Sheet "${sheet.name}" looked like a monthly calendar, but no styled day cells were recognized.`
        );
      }
    }

    if (days.length === 0) {
      throw new Error(
        "The monthly calendar did not contain any recognizable availability day cells."
      );
    }

    days.sort((first, second) =>
      first.date.localeCompare(second.date)
    );

    const yachtSourceKey = "monthly-calendar:imported-yacht";

    const yacht: NormalizedYacht = {
      sourceKey: yachtSourceKey,
      name: "Imported Yacht",
      sourceSheet: detection.sheetName ?? days[0].sourceSheet,
      sourceRow: null,
      sourceColumn: null,
      brochureUrl: null,
      metadata: {
        parserId: PARSER_ID,
        calendarSheetCount: workbook.sheets.length,
      },
    };

    const availability = aggregateDays(
      days,
      yachtSourceKey,
      yacht.name
    );

    return {
      parserId: PARSER_ID,
      layout: "monthly_calendar",
      confidence: Math.max(detection.confidence, 0.9),
      yachts: [yacht],
      availability,
      warnings,
      metadata: {
        sheetName: detection.sheetName,
        detectedYear: findDetectedYear(days),
        yachtCount: 1,
        availabilityCount: availability.length,
        calendarDayCount: days.length,
      },
    };
  },
};

/**
 * The year for the whole workbook, resolved once.
 *
 * Resolved per workbook rather than per sheet on purpose. A booking list with
 * MAY through OCTOBER tabs, none of which states a year, would otherwise have
 * each tab guess independently: read in September, MAY infers next year and
 * OCTOBER infers this one, and a single season is split across two. One
 * answer applied to every tab is wrong less often and never inconsistently.
 *
 * Order of preference, most trustworthy first:
 *
 *   1. A year written beside a month on any sheet. Explicit and unambiguous.
 *   2. A four digit year in the document title. Brokers put the season there
 *      constantly and nowhere else, which is exactly the NOVI DAN case.
 *   3. A bare four digit year anywhere in the first rows of any sheet.
 *   4. Inference from the calendar's own months.
 */
/** Same normalisation the other parsers use: trim, collapse, strip nbsp. */
function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveWorkbookYear(
  workbook: ParsedWorkbook
): { year: number; inferred: boolean } {
  for (const sheet of workbook.sheets) {
    const explicit = findMonthYearOnSheet(sheet);

    if (explicit) {
      return { year: explicit.year, inferred: false };
    }
  }

  const fromTitle = /\b(20\d{2})\b/.exec(workbook.fileName ?? "");

  if (fromTitle) {
    return { year: Number(fromTitle[1]), inferred: false };
  }

  for (const sheet of workbook.sheets) {
    const sample = sheet.cells
      .slice(0, 60)
      .map((cell) => cell.formattedValue ?? String(cell.value ?? ""))
      .join(" ");

    const bare = /\b(20\d{2})\b/.exec(`${sheet.name} ${sample}`);

    if (bare) {
      return { year: Number(bare[1]), inferred: false };
    }
  }

  /*
   * Nothing states a year anywhere. A charter calendar is about a season that
   * has not finished, so the year chosen is the one in which the latest month
   * present has not yet passed.
   *
   * Marked inferred, because a wrong year puts a whole season on the wrong
   * dates and the broker should be told rather than left to notice.
   */
  const now = new Date();

  const months = workbook.sheets
    .map((sheet) => MONTHS[normalizeText(sheet.name).toLowerCase()])
    .filter((month): month is number => typeof month === "number");

  const latest = months.length > 0 ? Math.max(...months) : 12;

  const year =
    latest < now.getUTCMonth() + 1
      ? now.getUTCFullYear() + 1
      : now.getUTCFullYear();

  return { year, inferred: true };
}

/** A month and year stated together on one sheet. */
function findMonthYearOnSheet(
  sheet: ParsedWorksheet
): { month: number; year: number } | null {
  const sample = [
    sheet.name,
    ...sheet.cells
      .slice(0, 40)
      .map((cell) =>
        cell.formattedValue ?? String(cell.value ?? "")
      ),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const monthPattern = Object.keys(MONTHS)
    .sort((first, second) => second.length - first.length)
    .join("|");

  const monthThenYear = new RegExp(
    `\\b(${monthPattern})\\s*[,/-]?\\s*(20\\d{2})\\b`,
    "i"
  ).exec(sample);

  if (monthThenYear) {
    return {
      month: MONTHS[monthThenYear[1].toLowerCase()],
      year: Number(monthThenYear[2]),
    };
  }

  const yearThenMonth = new RegExp(
    `\\b(20\\d{2})\\s*[,/-]?\\s*(${monthPattern})\\b`,
    "i"
  ).exec(sample);

  if (yearThenMonth) {
    return {
      month: MONTHS[yearThenMonth[2].toLowerCase()],
      year: Number(yearThenMonth[1]),
    };
  }

  return null;
}

/**
 * The month on a sheet, with the workbook's year applied.
 *
 * This is what unblocked NOVI DAN. The old version required a month and a
 * year in the same sample, so a tab headed "AUGUST" inside a file called
 * "... 2026" scored zero and every parser declined the whole workbook.
 */
function findMonthYear(
  sheet: ParsedWorksheet,
  workbook: ParsedWorkbook
): { month: number; year: number } | null {
  const stated = findMonthYearOnSheet(sheet);

  if (stated) {
    return stated;
  }

  const month = findMonthOnly(sheet);

  if (month === null) {
    return null;
  }

  return {
    month,
    year: resolveWorkbookYear(workbook).year,
  };
}

/**
 * A month named without a year.
 *
 * Restricted to the sheet name and the first handful of cells, because a
 * month word can appear anywhere in a broker's notes - "confirm before
 * August" - and matching that would date a calendar from a comment.
 */
function findMonthOnly(sheet: ParsedWorksheet): number | null {
  const fromName = MONTHS[normalizeText(sheet.name).toLowerCase()];

  if (typeof fromName === "number") {
    return fromName;
  }

  const heading = sheet.cells
    .slice(0, 12)
    .map((cell) => normalizeText(cell.formattedValue ?? cell.value))
    .find((value) => typeof MONTHS[value.toLowerCase()] === "number");

  return heading ? MONTHS[heading.toLowerCase()] : null;
}

function parseCalendarDay(
  value: SerializableCellValue
): number | null {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 31
  ) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = /^\s*(\d{1,2})\s*$/.exec(value);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  return day >= 1 && day <= 31 ? day : null;
}

function statusFromFill(
  fill: WorkbookCellFill | undefined
): AvailabilityStatus {
  const color = normalizeColor(
    fill?.foregroundColor ?? fill?.backgroundColor
  );

  if (!color) {
    return "unknown";
  }

  if (color === "10B981") return "available";
  if (color === "8B5CF6") return "booked";
  if (color === "F59E0B") return "option";
  if (color === "06B6D4") return "reserved";
  if (color === "F97316") return "unavailable";
  if (color === "EF4444") return "unavailable";

  const red = Number.parseInt(color.slice(0, 2), 16);
  const green = Number.parseInt(color.slice(2, 4), 16);
  const blue = Number.parseInt(color.slice(4, 6), 16);

  if (green > red * 1.18 && green > blue * 1.18) {
    return "available";
  }

  if (blue > red * 1.1 && red > green * 1.05) {
    return "booked";
  }

  if (red > 180 && green > 110 && blue < 110) {
    return "option";
  }

  if (red > 170 && green < 140) {
    return "unavailable";
  }

  return "unknown";
}

function normalizeColor(
  value: string | undefined
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toUpperCase()
    .replace(/^#/, "")
    .replace(/^FF(?=[0-9A-F]{6}$)/, "");

  return /^[0-9A-F]{6}$/.test(normalized)
    ? normalized
    : null;
}

function aggregateDays(
  days: CalendarDay[],
  yachtSourceKey: string,
  yachtName: string
): NormalizedAvailability[] {
  const windows: NormalizedAvailability[] = [];
  let current: CalendarDay[] = [];

  const flush = () => {
    if (current.length === 0) {
      return;
    }

    const first = current[0];
    const last = current[current.length - 1];

    windows.push({
      sourceKey: [
        yachtSourceKey,
        first.date,
        last.date,
        first.status,
      ].join(":"),
      yachtSourceKey,
      yachtName,
      startDate: first.date,
      endDate: last.date,
      status: first.status,
      price: null,
      currency: null,
      rawValue: first.rawValue,
      sourceSheet: first.sourceSheet,
      sourceCell: first.sourceCell,
      sourceRow: first.sourceRow,
      sourceColumn: first.sourceColumn,
      notes: null,
      metadata: {
        parserId: PARSER_ID,
        calendarDayCount: current.length,
        sourceCells: current.map((day) => day.sourceCell),
        sourceFill: first.fill ?? null,
      },
    });

    current = [];
  };

  for (const day of days) {
    const previous = current[current.length - 1];

    if (
      previous &&
      (previous.status !== day.status ||
        addDays(previous.date, 1) !== day.date)
    ) {
      flush();
    }

    current.push(day);
  }

  flush();
  return windows;
}

function toIsoDate(
  year: number,
  month: number,
  day: number
): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function addDays(
  isoDate: string,
  amount: number
): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function findDetectedYear(
  days: CalendarDay[]
): number | null {
  const year = Number(days[0]?.date.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}