import * as XLSX from "xlsx";

export type SerializableCellValue =
  | string
  | number
  | boolean
  | null;

export interface WorkbookCellFill {
  patternType?: string;
  foregroundColor?: string;
  backgroundColor?: string;
}

export interface WorkbookCell {
  address: string;
  row: number;
  column: number;
  value: SerializableCellValue;
  formattedValue?: string;
  formula?: string;
  type?: string;
  numberFormat?: string;
  fill?: WorkbookCellFill;
  styleId?: number | string;
}

export interface WorkbookMerge {
  start: string;
  end: string;
}

export interface ParsedWorksheet {
  name: string;
  range: string | null;
  rowCount: number;
  columnCount: number;
  matrix: SerializableCellValue[][];
  cells: WorkbookCell[];
  merges: WorkbookMerge[];
  records: Record<string, SerializableCellValue>[];
}

export interface ParsedWorkbook {
  kind: "workbook";
  sheetCount: number;
  rowCount: number;
  sheetNames: string[];
  sheets: ParsedWorksheet[];

  /**
   * The document's own name, where the connector could learn it.
   *
   * Carried because brokers put the season in the file name and nowhere else.
   * A tab headed "AUGUST" inside "NOVI DAN BOOKING LIST 2026" is a complete
   * statement to a person and an incomplete one to a parser, and the missing
   * half is here.
   */
  fileName?: string;
}

interface SheetJsColor {
  rgb?: string;
  indexed?: number;
  theme?: number;
  tint?: number;
}

interface SheetJsStyle {
  patternType?: string;
  fgColor?: SheetJsColor;
  bgColor?: SheetJsColor;
}

type ExtendedCell = XLSX.CellObject & {
  s?: SheetJsStyle | number;
};

function normalizeCellValue(
  value: unknown
): SerializableCellValue {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function extractColor(
  color?: SheetJsColor
): string | undefined {
  if (!color) {
    return undefined;
  }

  if (color.rgb) {
    return color.rgb.toUpperCase();
  }

  if (
    typeof color.indexed === "number"
  ) {
    return `INDEXED:${color.indexed}`;
  }

  if (
    typeof color.theme === "number"
  ) {
    const tint =
      typeof color.tint === "number"
        ? `:TINT:${color.tint}`
        : "";

    return `THEME:${color.theme}${tint}`;
  }

  return undefined;
}

function extractFill(
  style: ExtendedCell["s"]
): WorkbookCellFill | undefined {
  if (
    !style ||
    typeof style === "number"
  ) {
    return undefined;
  }

  const foregroundColor =
    extractColor(style.fgColor);

  const backgroundColor =
    extractColor(style.bgColor);

  if (
    !style.patternType &&
    !foregroundColor &&
    !backgroundColor
  ) {
    return undefined;
  }

  return {
    patternType: style.patternType,
    foregroundColor,
    backgroundColor,
  };
}

function getWorksheetDimensions(
  worksheet: XLSX.WorkSheet
): {
  range: string | null;
  rowCount: number;
  columnCount: number;
} {
  const rangeReference =
    worksheet["!ref"];

  if (!rangeReference) {
    return {
      range: null,
      rowCount: 0,
      columnCount: 0,
    };
  }

  const range =
    XLSX.utils.decode_range(
      rangeReference
    );

  return {
    range: rangeReference,
    rowCount:
      range.e.r - range.s.r + 1,
    columnCount:
      range.e.c - range.s.c + 1,
  };
}

function extractCells(
  worksheet: XLSX.WorkSheet
): WorkbookCell[] {
  const cells: WorkbookCell[] = [];

  for (
    const address of Object.keys(
      worksheet
    )
  ) {
    if (address.startsWith("!")) {
      continue;
    }

    const cell = worksheet[
      address
    ] as ExtendedCell | undefined;

    if (!cell) {
      continue;
    }

    const hasValue =
      cell.v !== undefined &&
      cell.v !== null;

    const hasStyle =
      cell.s !== undefined &&
      cell.s !== null;

    if (!hasValue && !hasStyle) {
      continue;
    }

    const decodedAddress =
      XLSX.utils.decode_cell(address);

    const style = cell.s;

    cells.push({
      address,
      row: decodedAddress.r + 1,
      column: decodedAddress.c + 1,
      value: hasValue
        ? normalizeCellValue(cell.v)
        : null,
      formattedValue:
        typeof cell.w === "string"
          ? cell.w
          : undefined,
      formula:
        typeof cell.f === "string"
          ? cell.f
          : undefined,
      type: cell.t,
      numberFormat:
        typeof cell.z === "string"
          ? cell.z
          : undefined,
      fill: extractFill(style),
      styleId:
        typeof style === "number"
          ? style
          : undefined,
    });
  }

  return cells.sort(
    (first, second) => {
      if (
        first.row !== second.row
      ) {
        return (
          first.row - second.row
        );
      }

      return (
        first.column -
        second.column
      );
    }
  );
}

function extractMerges(
  worksheet: XLSX.WorkSheet
): WorkbookMerge[] {
  const merges =
    worksheet["!merges"] ?? [];

  return merges.map(
    (merge) => ({
      start:
        XLSX.utils.encode_cell(
          merge.s
        ),
      end:
        XLSX.utils.encode_cell(
          merge.e
        ),
    })
  );
}

function extractMatrix(
  worksheet: XLSX.WorkSheet
): SerializableCellValue[][] {
  const rows =
    XLSX.utils.sheet_to_json<
      unknown[]
    >(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });

  return rows.map((row) =>
    row.map((value) =>
      normalizeCellValue(value)
    )
  );
}

function extractRecords(
  worksheet: XLSX.WorkSheet
): Record<
  string,
  SerializableCellValue
>[] {
  const records =
    XLSX.utils.sheet_to_json<
      Record<string, unknown>
    >(worksheet, {
      raw: true,
      defval: null,
      blankrows: false,
    });

  return records.map((record) =>
    Object.fromEntries(
      Object.entries(record).map(
        ([key, value]) => [
          key,
          normalizeCellValue(
            value
          ),
        ]
      )
    )
  );
}

export function parseWorkbook(
  workbookBuffer: ArrayBuffer
): ParsedWorkbook {
  if (
    workbookBuffer.byteLength === 0
  ) {
    throw new Error(
      "The downloaded workbook is empty. Confirm that the sharing link allows direct file downloads."
    );
  }

  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(
      workbookBuffer,
      {
        type: "array",
        cellStyles: true,
        cellNF: true,
        cellDates: true,
        cellFormula: true,
        cellText: true,
      }
    );
  } catch (error) {
    const parserMessage =
      error instanceof Error
        ? error.message
        : "Unknown workbook parser error.";

    throw new Error(
      "The downloaded file could not be opened as an Excel workbook. " +
        "Confirm that the shared URL points to a valid .xlsx file and is accessible without signing in. " +
        `Parser detail: ${parserMessage}`
    );
  }

  if (
    workbook.SheetNames.length === 0
  ) {
    throw new Error(
      "The downloaded workbook does not contain any worksheets."
    );
  }

  const sheets: ParsedWorksheet[] =
    workbook.SheetNames.map(
      (sheetName) => {
        const worksheet =
          workbook.Sheets[
            sheetName
          ];

        if (!worksheet) {
          return {
            name: sheetName,
            range: null,
            rowCount: 0,
            columnCount: 0,
            matrix: [],
            cells: [],
            merges: [],
            records: [],
          };
        }

        const dimensions =
          getWorksheetDimensions(
            worksheet
          );

        return {
          name: sheetName,
          range:
            dimensions.range,
          rowCount:
            dimensions.rowCount,
          columnCount:
            dimensions.columnCount,
          matrix:
            extractMatrix(
              worksheet
            ),
          cells:
            extractCells(
              worksheet
            ),
          merges:
            extractMerges(
              worksheet
            ),
          records:
            extractRecords(
              worksheet
            ),
        };
      }
    );

  return {
    kind: "workbook",
    sheetCount:
      sheets.length,
    rowCount:
      sheets.reduce(
        (total, sheet) =>
          total +
          sheet.rowCount,
        0
      ),
    sheetNames:
      sheets.map(
        (sheet) =>
          sheet.name
      ),
    sheets,
  };
}