import { describe, expect, it } from 'vitest';

import { type CsvColumn, toCsv } from './csv.util';

interface Row {
  readonly v: string | number | boolean | null | undefined;
}

const COLUMNS: readonly CsvColumn<Row>[] = [{ key: 'v', label: 'V', value: (r) => r.v }];

/** The single body cell produced for `v` — the only way to reach the private `escapeCell`. */
function body(v: Row['v']): string {
  return toCsv(COLUMNS, [{ v }]).split('\r\n')[1];
}

describe('toCsv', () => {
  it('neutralizes every formula-leading character, and nothing else', () => {
    // The six triggers of /^[=+\-@\t\r]/ — the regression suite for the
    // formula-injection fix. An apostrophe prefix forces the cell to be text.
    expect(body('=1+1')).toBe("'=1+1");
    expect(body('+1')).toBe("'+1");
    expect(body('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(body('-5')).toBe("'-5");
    // Tab is neutralized but is NOT in the quote-trigger set /[",\r\n]/.
    expect(body('\tx')).toBe("'\tx");
    // CR trips both branches: prefixed, then quoted.
    expect(body('\rx')).toBe('"\'\rx"');

    // KNOWN WART, pinned rather than endorsed: a negative NUMBER is prefixed
    // too, so it lands in Excel as text and SUM silently skips it. Fixing that
    // is a separate security-reviewed change.
    expect(body(-5)).toBe("'-5");

    // The regex is anchored — over-escaping every cell containing `=` or `-`
    // would corrupt legitimate exports.
    expect(body('safe')).toBe('safe');
    expect(body('a=b')).toBe('a=b');
    expect(body('re-issued')).toBe('re-issued');
  });

  it('neutralizes BEFORE quoting, so the apostrophe stays inside the quoted field', () => {
    // The classic DDE payload exercises both branches at once. A refactor that
    // quoted first would emit `"'"=cmd…`, leaving the apostrophe outside the
    // field and the cell still injectable. That ordering IS the fix.
    expect(body('=cmd|"/c calc"!A0')).toBe('"\'=cmd|""/c calc""!A0"');
  });

  it('shapes the document: BOM, CRLF, escaped header, empty cells', () => {
    // UTF-8 BOM so Excel opens Vietnamese text correctly.
    expect(toCsv(COLUMNS, []).startsWith('﻿')).toBe(true);
    expect(toCsv(COLUMNS, [])).toBe('﻿V\r\n');

    // The header goes through the same escape — a label is developer-authored
    // today, but the guarantee should not depend on that.
    const hostile: readonly CsvColumn<Row>[] = [{ key: 'v', label: '=Total', value: (r) => r.v }];
    expect(toCsv(hostile, [])).toBe("﻿'=Total\r\n");

    // Rows join with CRLF, not LF.
    expect(toCsv(COLUMNS, [{ v: 'a' }, { v: 'b' }])).toBe('﻿V\r\na\r\nb');

    // Empty cells are empty — not the strings "null"/"undefined".
    expect(body(null)).toBe('');
    expect(body(undefined)).toBe('');
  });
});
