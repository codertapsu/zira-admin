import { inject, Injectable } from '@angular/core';

import type { Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { EventLookup, ProjectLookup, TaskLookup, TaskVersionLookup } from './support.models';

/**
 * Client for the read-only support-desk lookup endpoints (`/admin/support`).
 * These bypass the feature-membership ACL by design on the server, gated
 * solely by the Admin/Staff role guard — there are no mutations here.
 */
@Injectable({ providedIn: 'root' })
export class SupportService {
  private readonly _api = inject(ApiService);

  public getProject(id: string): Observable<ProjectLookup> {
    return this._api.get<ProjectLookup>(`/admin/support/projects/${id}`);
  }

  public getTask(id: string): Observable<TaskLookup> {
    return this._api.get<TaskLookup>(`/admin/support/tasks/${id}`);
  }

  public getTaskVersions(id: string): Observable<TaskVersionLookup[]> {
    return this._api.get<TaskVersionLookup[]>(`/admin/support/tasks/${id}/versions`);
  }

  public getEvent(id: string): Observable<EventLookup> {
    return this._api.get<EventLookup>(`/admin/support/events/${id}`);
  }
}
