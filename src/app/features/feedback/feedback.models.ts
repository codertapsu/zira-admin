import type { UserSummary } from '../../core/api/models';

export type FeedbackStatus = 'new' | 'open' | 'in_progress' | 'resolved' | 'closed';
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = [
  'new',
  'open',
  'in_progress',
  'resolved',
  'closed',
];

export type FeedbackType = 'bug' | 'idea' | 'request' | 'question' | 'other';
export const FEEDBACK_TYPES: readonly FeedbackType[] = [
  'bug',
  'idea',
  'request',
  'question',
  'other',
];

export type FeedbackSource = 'web' | 'zalo' | 'telegram' | 'other';

export type FeedbackSortBy = 'createdAt' | 'updatedAt' | 'status' | 'type';

export interface FeedbackFilterDto {
  logicalOperator?: 'AND' | 'OR';
  types?: FeedbackType[];
  statuses?: FeedbackStatus[];
  createdByIds?: string[];
  createdAtFrom?: string;
  createdAtTo?: string;
  q?: string;
}

export interface FeedbackSearchOptionsDto {
  sortBy?: FeedbackSortBy;
  sortDir?: 'asc' | 'desc';
  cursor?: string;
  limit?: number;
}

export interface FeedbackSearchDto {
  filter: FeedbackFilterDto;
  options?: FeedbackSearchOptionsDto;
}

export interface FeedbackReplyResponse {
  id: string;
  feedbackId: string;
  message: string;
  createdBy?: UserSummary;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackResponse {
  id: string;
  title: string | null;
  message: string;
  type: FeedbackType;
  status: FeedbackStatus;
  source: FeedbackSource;
  context: Record<string, unknown> | null;
  createdBy?: UserSummary;
  createdAt: string;
  updatedAt: string;
  replyCount?: number;
  replies?: FeedbackReplyResponse[];
}
