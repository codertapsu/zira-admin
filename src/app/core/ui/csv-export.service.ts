import { inject, Injectable } from '@angular/core';

import { type ConsoleExportType, ExportAuditService } from '../api/export-audit.service';
import { type CsvColumn, toCsv } from './csv.util';

/**
 * The only way to hand a CSV to the operator.
 *
 * `downloadCsv` used to be a free function, so recording the egress would have
 * been a second call every site had to remember — and the one that forgot would
 * be invisible. Folding the record into the download makes it structural: a file
 * cannot leave without a row being written, because there is no other path.
 */
@Injectable({ providedIn: 'root' })
export class CsvExportService {
  private readonly _audit = inject(ExportAuditService);

  public download<T>(
    exportType: ConsoleExportType,
    filename: string,
    columns: readonly CsvColumn<T>[],
    rows: readonly T[],
    scopeParams?: Record<string, unknown>,
  ): void {
    const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;

    this._audit.record({
      exportType,
      filename: name,
      scopeParams: { ...(scopeParams ?? {}), rowCount: rows.length },
    });

    const csv = toCsv(columns, rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = name;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Revoke on the next tick so the download has time to start.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
