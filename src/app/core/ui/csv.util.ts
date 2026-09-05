/** One exportable column: how to read + label a field for the CSV. */
export interface CsvColumn<T> {
  readonly key: string;
  readonly label: string;
  readonly value: (row: T) => string | number | boolean | null | undefined;
}

function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  // FORMULA INJECTION. Excel, Sheets and LibreOffice evaluate a cell that opens
  // with =, +, -, @, tab or CR as a formula — so an attacker-controlled field
  // (a display name, a feedback body) becomes code in the operator's spreadsheet
  // the moment they open the export. Prefixing with an apostrophe forces it to
  // be read as text; the apostrophe is not displayed.
  const neutralized = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  // Quote when the cell contains a delimiter, quote, or newline; double inner quotes.
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/**
 * Build a CSV string from rows + typed columns. Prefixed with a UTF-8 BOM so
 * Excel opens Vietnamese text correctly.
 */
export function toCsv<T>(columns: readonly CsvColumn<T>[], rows: readonly T[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
    .join('\r\n');
  return `﻿${header}\r\n${body}`;
}

// NOTE: there is deliberately no `downloadCsv` here any more. Handing a file to
// the operator goes through `CsvExportService.download`, which records the
// egress first — see that service for why. Keeping a free download function
// beside it would just be the hole again, one import away.
