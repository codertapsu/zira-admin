import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { SystemSettingResponse } from './system-settings.models';

interface SettingsList {
  settings: SystemSettingResponse[];
}

@Injectable({ providedIn: 'root' })
export class SystemSettingsService {
  private readonly _api = inject(ApiService);

  public list(): Observable<SystemSettingResponse[]> {
    return this._api.get<SettingsList>('/admin/system-settings').pipe(map((res) => res.settings));
  }

  public update(key: string, value: unknown): Observable<SystemSettingResponse> {
    return this._api.patch<SystemSettingResponse>(
      `/admin/system-settings/${encodeURIComponent(key)}`,
      { value },
    );
  }
}
