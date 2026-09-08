import type {
  ParsedWorkbook,
} from "../source-types";

import {
  blockAndGridParser,
} from "./block-and-grid";
import {
  bookingTableParser,
} from "./booking-table";
import {
  detectWorkbookLayout,
} from "./detect-layout";
import {
  genericYachtTableParser,
} from "./generic-yacht-table";
import {
  horizontalYachtCalendarParser,
} from "./horizontal-yacht-calendar";
import {
  monthlyCalendarParser,
} from "./monthly-calendar";
import {
  singleYachtWeeklyCalendarParser,
} from "./single-yacht-weekly-calendar";

import type {
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserLayout,
  ParserResult,
  WorkbookParser,
} from "./types";

export type {
  AvailabilityStatus,
  NormalizedAvailability,
  NormalizedYacht,
  ParserDetection,
  ParserLayout,
  ParserResult,
  WorkbookParser,
  WorksheetAnalysis,
} from "./types";
import { sanitizeParsedValue } from "@/lib/security/sanitize-parsed";

const parsers:
  WorkbookParser[] = [
    singleYachtWeeklyCalendarParser,
    horizontalYachtCalendarParser,
    bookingTableParser,
    genericYachtTableParser,
    monthlyCalendarParser,
  blockAndGridParser,
];

/**
 * Parse every sheet, not just the first one.
 *
 * Each page of a PDF becomes its own worksheet, and every parser resolves its
 * target sheet as `workbook.sheets.find(...) ?? workbook.sheets[0]` while its
 * `detect()` only ever inspects `sheets[0]`. On a single-page file that is
 * invisible. On a 54-page season calendar it means page one is imported and
 * the other fifty-three are discarded, silently, behind a green card
 * reporting a successful sync.
 *
 * A 35-yacht test fixture of 1,820 rows imported as one yacht and 32 windows.
 * The broker has no way to notice: the import succeeds, the card says
 * healthy, and the fleet is simply missing.
 *
 * Rather than rewrite six parsers to be sheet-aware, each sheet is handed to
 * the existing single-sheet chain on its own and the results are merged. A
 * page that cannot be read no longer costs the pages that can.
 */
export function parseYachtWorkbook(
  workbook: ParsedWorkbook
): ParserResult {
  if (workbook.sheets.length <= 1) {
    return parseSingleSheet(workbook);
  }

  const sheetResults: ParserResult[] = [];
  const sheetFailures: string[] = [];

  for (const sheet of workbook.sheets) {
    const singleSheetWorkbook: ParsedWorkbook = {
      kind: "workbook",
      sheetCount: 1,
      rowCount: sheet.rowCount,
      sheets: [sheet],

      /*
       * The file name has to survive the split.
       *
       * Splitting a workbook into one-sheet workbooks and dropping this
       * loses the only place the season is written for a calendar whose tabs
       * are bare month names. Each tab then falls back to inferring its own
       * year, and a MAY tab and an OCTOBER tab read in September land in
       * different years - one season, split in half.
       */
      fileName: workbook.fileName,

      /*
       * Every sheet name, not just this one, so a tab with no year of its own
       * can still borrow one stated on a sibling tab.
       */
      sheetNames: workbook.sheetNames,
    };

    try {
      sheetResults.push(parseSingleSheet(singleSheetWorkbook));
    } catch (error) {
      /*
       * Expected, and not fatal. A cover page, a notes page or a page of
       * terms will fail here while the calendar pages around it parse
       * perfectly. Only a file where every page fails is a file that could
       * not be read.
       */
      sheetFailures.push(
        `${sheet.name}: ${
          error instanceof Error ? error.message : "could not be parsed"
        }`
      );
    }
  }

  if (sheetResults.length === 0) {
    throw new Error(
      `No parser could read any of the ${workbook.sheets.length} pages in ` +
        "this file. If the availability is laid out as prose or a designed " +
        "brochure, use AI extraction instead."
    );
  }

  return mergeSheetResults(sheetResults, sheetFailures, workbook);
}

function parseSingleSheet(
  workbook:
    ParsedWorkbook
): ParserResult {
  const detection =
    detectWorkbookLayout(
      workbook
    );

  /*
   * Prefer an exact parser ID and layout match.
   *
   * The layout fallback keeps parsing compatible when a parser
   * implementation is upgraded from v1 to v2 while detect-layout
   * still returns the older parser ID.
   */
  const parser =
    parsers.find(
      (
        candidate
      ) =>
        candidate.id ===
          detection.parserId &&
        candidate.layout ===
          detection.layout
    ) ??
    parsers.find(
      (
        candidate
      ) =>
        candidate.layout ===
        detection.layout
    );

  /*
   * Ordered list of parsers to attempt.
   *
   * The detector's choice goes first, then every other parser as a fallback.
   * Previously only the detected parser ran, and if it threw, the whole
   * import died. That is what happened with real operator files: the
   * detector committed to the single-yacht weekly calendar on a management
   * company's per-yacht block layout, that parser raised "found the yacht
   * title but no weekly date ranges", and the broker saw a raw internal
   * error instead of a working import or a clean fallback to AI extraction.
   *
   * A parser that cannot handle a workbook should step aside, not stop the
   * chain.
   */
  const candidates = parser
    ? [parser, ...parsers.filter((other) => other.id !== parser.id)]
    : [...parsers];

  const attempts: { parserId: string; reason: string }[] = [];

  let yachtsOnlyFallback: ParserResult | null = null;

  for (const candidate of candidates) {
    const compatibleDetection: ParserDetection = {
      ...detection,

      /*
       * Use the attempted parser's own ID so the parser result, activity log
       * and stored metadata stay internally consistent.
       */
      parserId: candidate.id,
      layout: candidate.layout,
    };

    let attempt: ParserResult;

    try {
      attempt = sanitizeParsedValue(
        candidate.parse(workbook, compatibleDetection)
      );
    } catch (error) {
      attempts.push({
        parserId: candidate.id,
        reason:
          error instanceof Error ? error.message : "parser threw",
      });
      continue;
    }

    // A parser that returns nothing has not understood the file either.
    if (
      attempt.yachts.length === 0 &&
      attempt.availability.length === 0
    ) {
      attempts.push({
        parserId: candidate.id,
        reason: "no yachts or availability found",
      });
      continue;
    }

    /*
     * Availability is the point. A parser that finds yacht names but no
     * dates has recognised some text, not read the calendar, and accepting
     * it stops better-matched parsers from ever running.
     *
     * That is not hypothetical: on a partner-network weekly grid the generic
     * table parser returned seven yacht names and zero availability rows,
     * winning ahead of the parser that actually reads that layout.
     *
     * So a yachts-only result is held as a fallback and the loop continues.
     */
    if (attempt.availability.length === 0) {
      if (!yachtsOnlyFallback) {
        yachtsOnlyFallback = attempt;
      }

      attempts.push({
        parserId: candidate.id,
        reason: `${attempt.yachts.length} yachts but no availability`,
      });
      continue;
    }

    return {
      ...attempt,
      warnings: [
        ...(attempt.warnings ?? []),
        ...attempts.map(
          (failed) => `${failed.parserId}: ${failed.reason}`
        ),
      ],
    };
  }

  // Nothing produced availability. A yachts-only result is still better than
  // failing outright: the fleet import succeeds and the broker can connect
  // the calendar separately.
  if (yachtsOnlyFallback) {
    return {
      ...yachtsOnlyFallback,
      warnings: [
        ...(yachtsOnlyFallback.warnings ?? []),
        "No availability could be read from this file.",
        ...attempts.map(
          (failed) => `${failed.parserId}: ${failed.reason}`
        ),
      ],
    };
  }

  /*
   * Nothing could read it. The message names what was tried, because "could
   * not parse" tells a broker nothing about whether to fix the file or send
   * it to AI extraction.
   */
  throw new Error(
    "No parser could read this file. " +
      `Tried ${attempts.length} layout${attempts.length === 1 ? "" : "s"}: ` +
      attempts.map((failed) => failed.parserId).join(", ") +
      ". If the availability is laid out as prose or a designed brochure, " +
      "use AI extraction instead."
  );
}

/**
 * Fold per-sheet results into one.
 *
 * The delicate part is yacht identity. Every parser builds its sourceKey from
 * the sheet name, so M/Y Solaris on page 1 is "…page-1:m-y-solaris" and the
 * same hull on page 2 is "…page-2:m-y-solaris". Importing both would create
 * one fleet row per page, which is the duplicate-yacht symptom arriving from
 * a new direction.
 *
 * So yachts are keyed by name across sheets, the first sheet to mention a
 * yacht owns its sourceKey, and every later reference is rewritten to point
 * at it.
 */
/** Header labels from the parsers' own alias lists, lowercased. */
const HEADER_WORDS = new Set([
  "yacht",
  "yacht name",
  "boat",
  "boat name",
  "vessel",
  "vessel name",
  "name",
]);

function mergeSheetResults(
  results: ParserResult[],
  sheetFailures: string[],
  workbook: ParsedWorkbook
): ParserResult {
  const yachtsByName = new Map<string, NormalizedYacht>();

  /** Later sheets' keys mapped onto the canonical key for the same yacht. */
  const keyRemap = new Map<string, string>();

  for (const result of results) {
    for (const yacht of result.yachts) {
      const nameKey = yacht.name.trim().toLowerCase();

      const existing = yachtsByName.get(nameKey);

      if (existing) {
        keyRemap.set(yacht.sourceKey, existing.sourceKey);
        continue;
      }

      yachtsByName.set(nameKey, yacht);
      keyRemap.set(yacht.sourceKey, yacht.sourceKey);
    }
  }

  const availability: NormalizedAvailability[] = [];

  /*
   * A repeated header row, or a week straddling a page break, can produce the
   * same window twice. Keyed on what makes a window distinct to a broker
   * rather than on the parser's own sourceKey, which embeds the page number
   * and would therefore never collide.
   */
  const seenWindows = new Set<string>();

  for (const result of results) {
    for (const window of result.availability) {
      const yachtSourceKey =
        keyRemap.get(window.yachtSourceKey) ?? window.yachtSourceKey;

      const windowKey = [
        yachtSourceKey,
        window.startDate ?? "",
        window.endDate ?? "",
        window.status,
      ].join("|");

      if (seenWindows.has(windowKey)) {
        continue;
      }

      seenWindows.add(windowKey);

      availability.push({
        ...window,
        yachtSourceKey,
      });
    }
  }

  // The layout that read the most pages describes the file better than
  // whichever one happened to read page one.
  const layoutCounts = new Map<ParserLayout, number>();

  for (const result of results) {
    layoutCounts.set(
      result.layout,
      (layoutCounts.get(result.layout) ?? 0) + 1
    );
  }

  const dominant = [...layoutCounts.entries()].sort(
    (first, second) => second[1] - first[1]
  )[0];

  const dominantResult =
    results.find((result) => result.layout === dominant[0]) ?? results[0];

  /*
   * Drop a header cell that was read as a yacht.
   *
   * Every page of a paginated export repeats its header row. On one page that
   * row lands where a parser expects data and "Yacht" is imported as a hull,
   * which then appears in the fleet list and in the match modal as a yacht
   * with no availability.
   *
   * Kept narrow deliberately: the name has to be a bare header word AND the
   * row has to have produced no windows at all. A fleet list with no dates is
   * a legitimate import, and a real yacht called "Vessel" would keep its
   * windows and survive this.
   */
  const yachtsWithWindows = new Set(
    availability.map((window) => window.yachtSourceKey)
  );

  const yachts = [...yachtsByName.values()].filter((yacht) => {
    if (yachtsWithWindows.has(yacht.sourceKey)) {
      return true;
    }

    return !HEADER_WORDS.has(yacht.name.trim().toLowerCase());
  });

  const warnings = [
    ...new Set(results.flatMap((result) => result.warnings ?? [])),
  ];

  if (sheetFailures.length > 0) {
    warnings.push(
      `${sheetFailures.length} of ${workbook.sheets.length} pages could not be read.`,
      ...sheetFailures.slice(0, 5)
    );
  }

  return {
    parserId: dominantResult.parserId,
    layout: dominantResult.layout,

    // Averaged across the pages that parsed, so one strong page does not
    // vouch for a file the parsers mostly struggled with.
    confidence: Math.round(
      results.reduce((total, result) => total + result.confidence, 0) /
        results.length
    ),
    yachts,
    availability,
    warnings,
    metadata: {
      ...dominantResult.metadata,
      sheetName: null,
      yachtCount: yachts.length,
      availabilityCount: availability.length,
      sheetsParsed: results.length,
      sheetsTotal: workbook.sheets.length,
      sheetsFailed: sheetFailures.length,
    },
  };
}

export function detectYachtWorkbook(
  workbook:
    ParsedWorkbook
): ParserDetection {
  return detectWorkbookLayout(
    workbook
  );
}