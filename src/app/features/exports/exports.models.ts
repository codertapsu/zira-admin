/**
 * Data-egress audit contracts, mirrored from
 * `zira-server/apps/api-gateway/src/modules/reports`:
 * - `ExportAuditLogResponse` / `ExportAuditLogListResponse`
 * - `AdminExportAuditQueryDto`
 *
 * Read-only admin/staff surface over the append-only `export_audit_log` table
 * — one row is written each time data leaves the system through an export
 * path (a report XLSX export, or an admin-initiated GDPR/PDPD user data
 * export). `userId` is the actor who triggered the egress, not necessarily
 * the data subject.
 */

/** One data-egress event (`GET /admin/export-audit`). */
export interface ExportAuditLogResponse {
  id: string;
  /** The user who triggered the export (the egress actor). */
  userId: string;
  /** Export kind — a report type for report exports, or `user-data-export`. */
  exportType: string;
  /** Scope the export covered (report type/title/filename, or the target user for an admin data export). */
  scopeParams: Record<string, unknown> | null;
  /** ID of the generated file blob, when known. */
  fileId: string | null;
  /** Presigned download URL of the generated file. Rewritten to absolute by `ExportsService`. */
  fileUrl: string | null;
  /** Originating client IP, when captured. */
  ip: string | null;
  /** ISO 8601. */
  createdAt: string;
}

/** Filters for the audit list. `from`/`to` are ISO 8601 and both inclusive. */
export interface ExportAuditFilter {
  userId?: string;
  from?: string;
  to?: string;
}
