import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { ItemsList } from '../../core/api/models';
import type {
  CampaignResponse,
  CampaignStats,
  CreateCampaign,
  UpdateCampaign,
} from './campaigns.models';

@Injectable({ providedIn: 'root' })
export class CampaignsService {
  private readonly _api = inject(ApiService);

  public list(status?: string, search?: string): Observable<CampaignResponse[]> {
    return this._api
      .get<ItemsList<CampaignResponse>>('/admin/campaigns', { status, search })
      .pipe(map((res) => res.items));
  }

  public getById(id: string): Observable<CampaignResponse> {
    return this._api.get<CampaignResponse>(`/admin/campaigns/${id}`);
  }

  public stats(id: string): Observable<CampaignStats> {
    return this._api.get<CampaignStats>(`/admin/campaigns/${id}/stats`);
  }

  public create(payload: CreateCampaign): Observable<CampaignResponse> {
    return this._api.post<CampaignResponse>('/admin/campaigns', payload);
  }

  public update(id: string, payload: UpdateCampaign): Observable<CampaignResponse> {
    return this._api.patch<CampaignResponse>(`/admin/campaigns/${id}`, payload);
  }

  public remove(id: string): Observable<void> {
    return this._api.delete(`/admin/campaigns/${id}`);
  }
}
