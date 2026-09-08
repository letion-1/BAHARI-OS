import { parseWorkbook } from "../workbook-parser";
import type { WorkbookConnectorResult } from "../source-types";

function extractSpreadsheetId(
  sourceUrl: string
): string {
  const match = sourceUrl.match(
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  if (!match?.[1]) {
    throw new Error(
      "Invalid Google Sheets URL."
    );
  }

  return match[1];
}

export async function fetchGoogleSheets(
  sourceUrl: string
): Promise<WorkbookConnectorResult> {
  const spreadsheetId =
    extractSpreadsheetId(sourceUrl);

  const exportUrl =
    `https://docs.google.com/spreadsheets/d/` +
    `${spreadsheetId}/export?format=xlsx`;

  const response = await fetch(
    exportUrl,
    {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    }
  );

  if (!response.ok) {
    throw new Error(
      `Google Sheets export failed with status ${response.status}.`
    );
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.toLowerCase() ?? "";

  if (
    contentType.includes("text/html") ||
    contentType.includes(
      "application/json"
    )
  ) {
    throw new Error(
      "Google returned a webpage instead of an XLSX file. " +
        "Confirm that the spreadsheet is publicly accessible."
    );
  }

  const workbookBuffer =
    await response.arrayBuffer();

  const workbook = parseWorkbook(
    workbookBuffer
  );

  /*
   * The document's real title, not the spreadsheet id.
   *
   * The export endpoint returns it in Content-Disposition, and it is the only
   * place the title appears: the XLSX itself carries sheet names but nothing
   * about the file. That matters because brokers write the season into the
   * title - "NOVI DAN BOOKING LIST 2026" - and leave the tabs as bare month
   * names. Without this the year is simply not in the data.
   */
  const documentTitle =
    readContentDispositionFilename(
      response.headers.get("content-disposition")
    ) ?? `${spreadsheetId}.xlsx`;

  workbook.fileName = documentTitle;

  return {
    kind: "workbook",
    sourceType: "google_sheets",
    fileName: documentTitle,
    workbook,
  };
}

/**
 * Pull the filename out of a Content-Disposition header.
 *
 * Google sends both `filename=` and the RFC 5987 `filename*=UTF-8''...` form.
 * The starred one is preferred because it survives non-ASCII characters, and
 * yacht names carry them constantly: Šibenik, Zoë, Côte d'Azur.
 */
function readContentDispositionFilename(
  header: string | null
): string | null {
  if (!header) {
    return null;
  }

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);

  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]).trim();
    } catch {
      // A malformed encoding is not worth failing the whole sync over.
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(header);

  return plain ? plain[1].trim() : null;
}