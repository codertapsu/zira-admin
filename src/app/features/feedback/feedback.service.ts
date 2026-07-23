import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type {
  FeedbackReplyResponse,
  FeedbackResponse,
  FeedbackSearchDto,
  FeedbackStatus,
} from './feedback.models';

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly _api = inject(ApiService);

  public search(body: FeedbackSearchDto): Observable<CursorPage<FeedbackResponse>> {
    return this._api.post<CursorPage<FeedbackResponse>>('/admin/feedback/search', body);
  }

  public getById(id: string): Observable<FeedbackResponse> {
    return this._api.get<FeedbackResponse>(`/admin/feedback/${id}`);
  }

  public setStatus(id: string, status: FeedbackStatus): Observable<FeedbackResponse> {
    return this._api.patch<FeedbackResponse>(`/admin/feedback/${id}/status`, { status });
  }

  public listReplies(id: string): Observable<FeedbackReplyResponse[]> {
    return this._api.get<FeedbackReplyResponse[]>(`/admin/feedback/${id}/replies`);
  }

  public addReply(id: string, message: string): Observable<FeedbackReplyResponse> {
    return this._api.post<FeedbackReplyResponse>(`/admin/feedback/${id}/replies`, { message });
  }
}
