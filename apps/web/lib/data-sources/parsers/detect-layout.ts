import type {
  ParsedWorkbook,
  ParsedWorksheet,
  SerializableCellValue,
} from "../source-types";

import type {
  ParserDetection,
  ParserLayout,
} from "./types";

type DetectionCandidate = ParserDetection & {
  priority: number;
};

const MONTH_NAMES = new Set([
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
  "jan","feb","mar","apr","jun","jul","aug","sep","sept","oct","nov","dec",
]);

const WEEKDAY_NAMES = new Set([
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
  "mon","tue","tues","wed","thu","thur","thurs","fri","sat","sun",
]);

const YACHT_HEADERS = new Set([
  "yacht","yacht name","boat","boat name","vessel","vessel name","name",
]);

const BOOKING_HEADERS = new Set([
  "guest","client","customer","from","to","start","end","arrival","departure",
  "check in","check out","check-in","check-out","status","booking",
  "availability","yacht","boat","vessel",
]);

const BOOKING_WORDS = [
  "booked","booking","available","not available","unavailable",
  "option","reserved","hold","private charter","cabin charter",
];

const SINGLE_YACHT_TITLE_PATTERNS = [
  /\bgulet\b/i,/\bm\/s\b/i,/\bm\/y\b/i,/\bmsy\b/i,
  /\bmotor yacht\b/i,/\bsailing yacht\b/i,/\bcatamaran\b/i,
  /\byacht\b/i,/\bbooking list\b/i,/\bbooking 20\d{2}\b/i,
];

export function detectWorkbookLayout(
  workbook: ParsedWorkbook
): ParserDetection {
  if (workbook.sheets.length === 0) {
    return {
      layout: "unknown",
      confidence: 0,
      parserId: "none",
      reasons: ["The workbook contains no worksheets."],
      sheetName: null,
    };
  }

  const candidates = workbook.sheets.flatMap(detectWorksheetLayouts);

  return candidates.sort((first, second) => {
    if (second.confidence !== first.confidence) {
      return second.confidence - first.confidence;
    }
    return second.priority - first.priority;
  })[0];
}

function detectWorksheetLayouts(
  worksheet: ParsedWorksheet
): DetectionCandidate[] {
  return [
    detectSingleYachtWeeklyCalendar(worksheet),
    detectHorizontalYachtCalendar(worksheet),
    detectMonthlyCalendar(worksheet),
    detectBookingTable(worksheet),
    detectGenericTable(worksheet),
  ];
}

function detectSingleYachtWeeklyCalendar(
  worksheet: ParsedWorksheet
): DetectionCandidate {
  const reasons: string[] = [];
  let score = 0;

  const allText = worksheet.cells
    .filter((cell) => typeof cell.value === "string")
    .map((cell) => normalizeText(cell.value))
    .filter(Boolean);

  const dateRangeCount = worksheet.cells.filter((cell) =>
    looksLikeDateRange(cell.value)
  ).length;

  if (dateRangeCount >= 3) {
    score += Math.min(50, 20 + dateRangeCount * 3);
    reasons.push(`${dateRangeCount} weekly date ranges were found.`);
  }

  const priceCount = worksheet.cells.filter((cell) =>
    looksLikePrice(cell.value)
  ).length;

  if (priceCount >= 2) {
    score += Math.min(20, 6 + priceCount);
    reasons.push(`${priceCount} charter-price cells were found.`);
  }

  const bookingWordCount = allText.filter((text) =>
    BOOKING_WORDS.some((word) => text.toLowerCase().includes(word))
  ).length;

  if (bookingWordCount >= 2) {
    score += Math.min(20, 6 + bookingWordCount);
    reasons.push(`${bookingWordCount} booking or availability labels were found.`);
  }

  const titleCandidateCount = worksheet.matrix
    .slice(0, 30)
    .flat()
    .filter((value) =>
      SINGLE_YACHT_TITLE_PATTERNS.some((pattern) =>
        pattern.test(normalizeText(value))
      )
    ).length;

  if (titleCandidateCount >= 1) {
    score += 12;
    reasons.push("A single-yacht title or booking-list heading was found.");
  }

  const yachtHeaderCount = worksheet.cells.filter((cell) =>
    YACHT_HEADERS.has(normalizeText(cell.value).toLowerCase())
  ).length;

  if (yachtHeaderCount === 0) {
    score += 8;
    reasons.push("No yacht-name table column was found, matching a workbook dedicated to one yacht.");
  } else {
    score -= 20;
  }

  return buildDetection({
    worksheet,
    layout: "single_yacht_weekly_calendar",
    parserId: "single-yacht-weekly-calendar-v1",
    score,
    reasons,
    priority: 100,
  });
}

function detectHorizontalYachtCalendar(
  worksheet: ParsedWorksheet
): DetectionCandidate {
  const reasons: string[] = [];
  let score = 0;

  const strongest = worksheet.matrix
    .slice(0, 20)
    .map((row, index) => ({
      row: index + 1,
      candidates: row.filter(isProbableYachtName),
    }))
    .filter((entry) => entry.candidates.length >= 3)
    .sort((a, b) => b.candidates.length - a.candidates.length)[0];

  if (strongest) {
    score += Math.min(45, strongest.candidates.length * 8);
    reasons.push(`${strongest.candidates.length} probable yacht headings were found across row ${strongest.row}.`);
  }

  const weeklyDateRows = worksheet.matrix.filter((row) => {
    const firstTen = row.slice(0, 10);
    return (
      firstTen.filter(looksLikeDatePart).length >= 2 &&
      firstTen.some(isRangeSeparator)
    );
  }).length;

  if (weeklyDateRows >= 3) {
    score += Math.min(35, weeklyDateRows * 4);
    reasons.push(`${weeklyDateRows} rows contain separate weekly start and end dates.`);
  }

  if (worksheet.columnCount >= 10) score += 8;
  if (!strongest) score -= 20;

  return buildDetection({
    worksheet,
    layout: "horizontal_yacht_calendar",
    parserId: "horizontal-yacht-calendar-v1",
    score,
    reasons,
    priority: 80,
  });
}

function detectMonthlyCalendar(
  worksheet: ParsedWorksheet
): DetectionCandidate {
  const reasons: string[] = [];
  let score = 0;

  const sheetName = normalizeText(worksheet.name).toLowerCase();
  if (MONTH_NAMES.has(sheetName)) {
    score += 30;
    reasons.push(`The worksheet name "${worksheet.name}" is a month.`);
  }

  /*
   * A month heading inside the sheet counts too.
   *
   * A tab can be named "Sheet1" and still carry AUGUST in a merged cell
   * across the top, which is how the calendar reads to a person. Scoring only
   * the tab name missed that entirely.
   */
  const headingMonth = worksheet.cells
    .slice(0, 12)
    .some((cell) =>
      MONTH_NAMES.has(
        normalizeText(cell.formattedValue ?? cell.value).toLowerCase()
      )
    );

  if (headingMonth && !MONTH_NAMES.has(sheetName)) {
    score += 24;
    reasons.push("A month name appears as a heading in the first rows.");
  }

  const weekdayCount = worksheet.matrix
    .slice(0, 6)
    .flat()
    .filter((value) =>
      WEEKDAY_NAMES.has(normalizeText(value).toLowerCase())
    ).length;

  if (weekdayCount >= 5) {
    score += 40;
    reasons.push(`${weekdayCount} weekday headings were found near the top.`);
  }

  const dayNumberCount = worksheet.cells.filter(
    (cell) =>
      typeof cell.value === "number" &&
      cell.value >= 1 &&
      cell.value <= 31
  ).length;

  if (dayNumberCount >= 20) score += 20;
  if (worksheet.columnCount >= 7 && worksheet.columnCount <= 9) score += 12;

  return buildDetection({
    worksheet,
    layout: "monthly_calendar",
    parserId: "monthly-calendar-v1",
    score,
    reasons,
    priority: 60,
  });
}

function detectBookingTable(
  worksheet: ParsedWorksheet
): DetectionCandidate {
  const reasons: string[] = [];
  let score = 0;
  let strongestHeaderCount = 0;
  let strongestHeaderRow = 0;

  worksheet.matrix.slice(0, 20).forEach((row, rowIndex) => {
    const count = row.filter((value) =>
      BOOKING_HEADERS.has(normalizeText(value).toLowerCase())
    ).length;

    if (count > strongestHeaderCount) {
      strongestHeaderCount = count;
      strongestHeaderRow = rowIndex + 1;
    }
  });

  if (strongestHeaderCount >= 3) {
    score += Math.min(70, strongestHeaderCount * 14);
    reasons.push(`${strongestHeaderCount} booking-table headers were found in row ${strongestHeaderRow}.`);
  }

  if (worksheet.records.length >= 3 && strongestHeaderCount >= 2) {
    score += 20;
  }

  const dateRangeCount = worksheet.cells.filter((cell) =>
    looksLikeDateRange(cell.value)
  ).length;

  if (dateRangeCount >= 3 && strongestHeaderCount < 3) score -= 20;

  return buildDetection({
    worksheet,
    layout: "booking_table",
    parserId: "booking-table-v1",
    score,
    reasons,
    priority: 50,
  });
}

function detectGenericTable(
  worksheet: ParsedWorksheet
): DetectionCandidate {
  const reasons: string[] = [];
  let score = 0;

  const yachtHeaderFound = worksheet.matrix
    .slice(0, 20)
    .some((row) =>
      row.some((value) =>
        YACHT_HEADERS.has(normalizeText(value).toLowerCase())
      )
    );

  if (yachtHeaderFound) {
    score += 55;
    reasons.push("A yacht, boat, vessel or name column was found.");
  }

  if (worksheet.records.length >= 3) score += 20;
  if (worksheet.rowCount >= 3 && worksheet.columnCount >= 2) score += 10;
  if (!yachtHeaderFound) score -= 15;

  return buildDetection({
    worksheet,
    layout: "generic_table",
    parserId: "generic-table-v1",
    score,
    reasons,
    priority: 20,
  });
}

function looksLikeDateRange(value: SerializableCellValue): boolean {
  const text = normalizeText(value).replace(/[–—]/g, "-");

  return (
    /^\d{1,2}[./-]\d{1,2}[./-]?\s*-\s*\d{1,2}[./-]\d{1,2}[./-]?$/.test(text) ||
    /^\d{1,2}[./-]\d{1,2}[./-]?\s*-\s*\d{1,2}[./-]?$/.test(text)
  );
}

function looksLikeDatePart(value: SerializableCellValue): boolean {
  return /^\d{1,2}[./-]\d{1,2}[./-]?$/.test(normalizeText(value));
}

function looksLikePrice(value: SerializableCellValue): boolean {
  if (typeof value === "number" && Number.isFinite(value) && value > 100) return true;
  const text = normalizeText(value);
  return /(?:€|\$|£|\bEUR\b|\bUSD\b|\bGBP\b)/i.test(text) && /\d/.test(text);
}

function isRangeSeparator(value: SerializableCellValue): boolean {
  return ["-", "–", "—"].includes(normalizeText(value));
}

function isProbableYachtName(value: SerializableCellValue): boolean {
  if (typeof value !== "string") return false;

  const text = normalizeText(value);
  if (
    text.length < 3 ||
    text.length > 80 ||
    text.includes("@") ||
    /^https?:\/\//i.test(text) ||
    looksLikeDateRange(text) ||
    looksLikeDatePart(text) ||
    looksLikePrice(text)
  ) {
    return false;
  }

  const lower = text.toLowerCase();

  if (
    MONTH_NAMES.has(lower) ||
    WEEKDAY_NAMES.has(lower) ||
    BOOKING_HEADERS.has(lower) ||
    BOOKING_WORDS.includes(lower)
  ) {
    return false;
  }

  const letters = text.match(/[A-Za-zÀ-ž]/g)?.length ?? 0;
  const uppercase = text.match(/[A-ZÀ-Ž]/g)?.length ?? 0;

  return letters >= 3 && uppercase / Math.max(letters, 1) >= 0.5;
}

function normalizeText(value: SerializableCellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function buildDetection({
  worksheet,
  layout,
  parserId,
  score,
  reasons,
  priority,
}: {
  worksheet: ParsedWorksheet;
  layout: ParserLayout;
  parserId: string;
  score: number;
  reasons: string[];
  priority: number;
}): DetectionCandidate {
  const confidence = Math.max(0, Math.min(100, Math.round(score)));

  return {
    layout: confidence >= 25 ? layout : "unknown",
    confidence,
    parserId: confidence >= 25 ? parserId : "none",
    reasons:
      reasons.length > 0
        ? reasons
        : ["No strong layout indicators were found."],
    sheetName: worksheet.name,
    priority,
  };
}