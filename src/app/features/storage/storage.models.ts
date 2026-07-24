/**
 * File-storage admin contracts, mirrored from the gateway's admin files
 * surface:
 * - `GET /admin/files/overview` — aggregate counts/sizes by status + driver.
 * - `GET /admin/users/:id/files` — cursor page of one owner's file rows.
 * - `GET /admin/files/:id/download` — one-time signed download URL.
 */

export type FileStatus = 'temporary' | 'active' | 'deleted';

export const FILE_STATUSES: readonly FileStatus[] = ['temporary', 'active', 'deleted'];

/** One rollup bucket in the overview (e.g. one status or one storage driver). */
export interface FilesOverviewBucket {
  label: string;
  count: number;
  totalSize: number;
}

/** `GET /admin/files/overview` response. */
export interface FilesOverviewResponse {
  totalCount: number;
  totalSize: number;
  byStatus: FilesOverviewBucket[];
  byDriver: FilesOverviewBucket[];
}

/** One row of `GET /admin/users/:id/files`. `size` is in bytes. */
export interface AdminFileResponse {
  id: string;
  ownerUserId: string;
  originalName: string;
  contentType: string;
  size: number;
  status: FileStatus;
  driver: string;
  createdAt: string;
}

/** Filters for the per-user file list. */
export interface AdminFileFilter {
  status?: FileStatus;
}

/** `GET /admin/files/:id/download` response — `url` comes back gateway-relative. */
export interface FileDownloadResponse {
  url: string;
}
