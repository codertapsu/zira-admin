import type { FeatureFlag, UserSummary } from '../../core/api/models';

/* ------------------------------------------------------------------- plans */

export interface SubscriptionPlanResponse {
  id: string;
  planCode: string;
  displayName: string;
  description: string | null;
  priceAmount: number;
  priceCurrency: string;
  defaultDurationMonths: number | null;
  featureKeys: FeatureFlag[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionPlanDto {
  planCode: string;
  displayName: string;
  description?: string | null;
  priceAmount: number;
  priceCurrency?: string;
  defaultDurationMonths?: number | null;
  featureKeys?: FeatureFlag[];
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateSubscriptionPlanDto = Partial<Omit<CreateSubscriptionPlanDto, 'planCode'>>;

/* -------------------------------------------------------- purchase requests */

export type SubscriptionPurchaseRequestStatus =
  'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export const SUBSCRIPTION_PURCHASE_REQUEST_STATUSES: readonly SubscriptionPurchaseRequestStatus[] =
  ['pending', 'accepted', 'rejected', 'cancelled', 'expired'];

export interface SubscriptionPurchaseRequestResponse {
  id: string;
  requester: UserSummary;
  decider: UserSummary | null;
  plan: SubscriptionPlanResponse;
  purchaseCode: string;
  requestedAmount: number;
  requestedCurrency: string;
  requestedDurationMonths: number | null;
  acceptedDurationMonths: number | null;
  status: SubscriptionPurchaseRequestStatus;
  note: string | null;
  promoCode: string | null;
  provider: string;
  providerReference: string | null;
  amountReceived: number | null;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptPurchaseRequestDto {
  durationMonths?: number;
  decisionNote?: string;
  amountReceived?: number;
  providerReference?: string;
}

export interface RejectPurchaseRequestDto {
  decisionNote?: string;
}

/* ------------------------------------------------------------- promo codes */

export interface PromoCodeResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromoCodeDto {
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
}

export type UpdatePromoCodeDto = Partial<Omit<CreatePromoCodeDto, 'code'>>;

/* --------------------------------------------------------- shared filters */

export type PlanStatusFilter = 'active' | 'inactive';
export const PLAN_STATUS_FILTERS: readonly PlanStatusFilter[] = ['active', 'inactive'];
