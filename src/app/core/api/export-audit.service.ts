import { inject, Injectable } from '@angular/core';

import { ApiService } from './api.service';

/**
 * Console-side export kinds. Mirrors `CONSOLE_EXPORT_TYPES` on the gateway,
 * which validates against the same list — a value missing there is rejected.
 */
export type ConsoleExportType =
  | 'admin-subscribers'
  | 'admin-feedback'
  | 'admin-purchase-requests'
  | 'admin-subscription-decisions'
  | 'admin-bot-bindings'
  | 'admin-files'
  | 'admin-rollouts'
  | 'admin-ai-usage-by-feature'
  | 'admin-ai-usage-by-model'
  | 'admin-export-audit';

export interface RecordConsoleExportInput {
  exportType: ConsoleExportType;
  filename: string;
  scopeParams?: Record<string, unknown>;
}

/**
 * Records a console CSV export in the gateway's data-egress trail.
 *
 * These exports are built in the browser from data the operator already
 * fetched, so nothing would otherwise reach the server and the Exports page —
 * which presents itself as the complete egress trail — omitted them entirely.
 * Several carry subscriber emails, feedback bodies and payment amounts.
 *
 * The row is written server-side: the actor and IP come from the session and
 * the connection, not from this payload. Only the kind and the filters travel
 * from here.
 */
@Injectable({ providedIn: 'root' })
export class ExportAuditService {
  private readonly _api = inject(ApiService);

  public record(input: RecordConsoleExportInput): void {
    this._api
      .post<void>('/admin/export-audit/console-exports', {
        exportType: input.exportType,
        filename: input.filename,
        scopeParams: input.scopeParams ?? {},
      })
      // Fire-and-forget: a failed audit write must not withhold a file the
      // operator is entitled to. The failure is visible server-side.
      .subscribe({ next: () => undefined, error: () => undefined });
  }
}
