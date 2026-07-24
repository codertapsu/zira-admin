import { Injectable, signal } from '@angular/core';

import type { InsightsSavedView, InsightsViewKind } from './insights.models';

const STORAGE_KEY = 'zira.admin.insights.views';

/**
 * Saved productivity/funnel query presets, persisted to `localStorage` so an
 * admin's frequently-run views survive a reload. Small N, operator-authored —
 * a plain read-modify-write on the whole array is simplest and matches
 * `TokenStoreService`-style localStorage usage elsewhere in this app.
 */
@Injectable({ providedIn: 'root' })
export class InsightsSavedViewsService {
  private readonly _views = signal<InsightsSavedView[]>(this._load());
  public readonly views = this._views.asReadonly();

  public forKind(kind: InsightsViewKind): InsightsSavedView[] {
    return this._views().filter((view) => view.kind === kind);
  }

  public find(id: string): InsightsSavedView | undefined {
    return this._views().find((view) => view.id === id);
  }

  public save(view: Omit<InsightsSavedView, 'id' | 'createdAt'>): InsightsSavedView {
    const saved: InsightsSavedView = {
      ...view,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };
    this._views.update((list) => [...list, saved]);
    this._persist();
    return saved;
  }

  public remove(id: string): void {
    this._views.update((list) => list.filter((view) => view.id !== id));
    this._persist();
  }

  private _load(): InsightsSavedView[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as InsightsSavedView[]) : [];
    } catch {
      return [];
    }
  }

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._views()));
    } catch {
      // Storage full/unavailable (private browsing) — saved views just won't persist.
    }
  }
}
