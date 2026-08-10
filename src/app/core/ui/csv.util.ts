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

/** Trigger a client-side download of the rows as a CSV file. */
export function downloadCsv<T>(
  filename: string,
  columns: readonly CsvColumn<T>[],
  rows: readonly T[],
): void {
  const csv = toCsv(columns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
