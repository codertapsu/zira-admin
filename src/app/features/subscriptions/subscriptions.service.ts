import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage, ItemsList } from '../../core/api/models';
import type {
  AcceptPurchaseRequestDto,
  CreatePromoCodeDto,
  CreateSubscriptionPlanDto,
  PromoCodeResponse,
  RejectPurchaseRequestDto,
  SubscriptionPlanResponse,
  SubscriptionPurchaseRequestResponse,
  UpdatePromoCodeDto,
  UpdateSubscriptionPlanDto,
} from './subscriptions.models';

export interface RequestListQuery {
  status?: string;
  purchaseCode?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly _api = inject(ApiService);

  /* ----------------------------------------------------------------- plans */

  public listPlans(status?: string, search?: string): Observable<SubscriptionPlanResponse[]> {
    return this._api
      .get<ItemsList<SubscriptionPlanResponse>>('/admin/subscription-plans', { status, search })
      .pipe(map((res) => res.items));
  }

  public getPlan(id: string): Observable<SubscriptionPlanResponse> {
    return this._api.get<SubscriptionPlanResponse>(`/admin/subscription-plans/${id}`);
  }

  public createPlan(payload: CreateSubscriptionPlanDto): Observable<SubscriptionPlanResponse> {
    return this._api.post<SubscriptionPlanResponse>('/admin/subscription-plans', payload);
  }

  public updatePlan(
    id: string,
    payload: UpdateSubscriptionPlanDto,
  ): Observable<SubscriptionPlanResponse> {
    return this._api.patch<SubscriptionPlanResponse>(`/admin/subscription-plans/${id}`, payload);
  }

  public removePlan(id: string): Observable<void> {
    return this._api.delete(`/admin/subscription-plans/${id}`);
  }

  /* ------------------------------------------------------ purchase requests */

  public listRequests(
    query: RequestListQuery,
  ): Observable<CursorPage<SubscriptionPurchaseRequestResponse>> {
    return this._api.get<CursorPage<SubscriptionPurchaseRequestResponse>>(
      '/admin/subscription-purchase-requests',
      {
        status: query.status,
        purchaseCode: query.purchaseCode,
        search: query.search,
        limit: query.limit,
        cursor: query.cursor,
      },
    );
  }

  public getRequest(id: string): Observable<SubscriptionPurchaseRequestResponse> {
    return this._api.get<SubscriptionPurchaseRequestResponse>(
      `/admin/subscription-purchase-requests/${id}`,
    );
  }

  public acceptRequest(
    id: string,
    payload: AcceptPurchaseRequestDto,
  ): Observable<SubscriptionPurchaseRequestResponse> {
    return this._api.post<SubscriptionPurchaseRequestResponse>(
      `/admin/subscription-purchase-requests/${id}/accept`,
      payload,
    );
  }

  public rejectRequest(
    id: string,
    payload: RejectPurchaseRequestDto,
  ): Observable<SubscriptionPurchaseRequestResponse> {
    return this._api.post<SubscriptionPurchaseRequestResponse>(
      `/admin/subscription-purchase-requests/${id}/reject`,
      payload,
    );
  }

  public removeRequest(id: string): Observable<void> {
    return this._api.delete(`/admin/subscription-purchase-requests/${id}`);
  }

  /* ----------------------------------------------------------- promo codes */

  public listPromoCodes(status?: string, search?: string): Observable<PromoCodeResponse[]> {
    return this._api
      .get<ItemsList<PromoCodeResponse>>('/admin/subscription-promo-codes', { status, search })
      .pipe(map((res) => res.items));
  }

  public getPromoCode(id: string): Observable<PromoCodeResponse> {
    return this._api.get<PromoCodeResponse>(`/admin/subscription-promo-codes/${id}`);
  }

  public createPromoCode(payload: CreatePromoCodeDto): Observable<PromoCodeResponse> {
    return this._api.post<PromoCodeResponse>('/admin/subscription-promo-codes', payload);
  }

  public updatePromoCode(id: string, payload: UpdatePromoCodeDto): Observable<PromoCodeResponse> {
    return this._api.patch<PromoCodeResponse>(`/admin/subscription-promo-codes/${id}`, payload);
  }

  public removePromoCode(id: string): Observable<void> {
    return this._api.delete(`/admin/subscription-promo-codes/${id}`);
  }
}
