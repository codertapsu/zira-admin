import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { catchError, of } from 'rxjs';

import type { UserSummary } from '../../core/api/models';
import { UsersService } from '../users/users.service';

function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** A user we only know by id (e.g. pasted, or a deleted account) — displayed as its raw id. */
function placeholderUser(id: string): UserSummary {
  return {
    id,
    displayName: id,
    firstName: '',
    lastName: '',
    email: null,
    username: null,
    isActive: true,
  };
}

/**
 * Searchable multi-select for a campaign's `specific_users` audience. Backed
 * by `POST /admin/users/search-summaries` so authors pick people by name —
 * with a "paste IDs" escape hatch for bulk/known-id targeting. Fully
 * controlled: the parent owns the selection (`selected`/`selectedChange`) so
 * it can hydrate from `targetUserIds` on load and read ids back out on save.
 */
@Component({
  selector: 'app-campaign-audience-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="user-picker">
      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search users to add"
          placeholder="Search name, username, email…"
          style="max-width: 280px"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          (keyup.enter)="search()"
        />
        <button class="btn btn--sm" type="button" (click)="search()">Search</button>
        <button class="btn btn--sm btn--ghost" type="button" (click)="pasteMode.set(!pasteMode())">
          {{ pasteMode() ? 'Hide paste box' : 'Paste IDs instead' }}
        </button>
      </div>

      @if (searching()) {
        <span class="muted" style="font-size: 12px">Searching…</span>
      } @else if (visibleResults().length > 0) {
        <div class="card user-picker__results">
          @for (user of visibleResults(); track user.id) {
            <button type="button" class="user-picker__result" (click)="add(user)">
              <span>{{ user.displayName || user.username || user.id }}</span>
              @if (user.username) {
                <span class="user-picker__result-sub">{{ '@' + user.username }}</span>
              }
            </button>
          }
        </div>
      } @else if (searched()) {
        <span class="muted" style="font-size: 12px">No matching users.</span>
      }

      @if (pasteMode()) {
        <label class="field">
          <span class="field__label">Paste user IDs (one per line)</span>
          <textarea
            class="input"
            rows="3"
            placeholder="One user id per line"
            [ngModel]="pasteText()"
            (ngModelChange)="pasteText.set($event)"
          ></textarea>
          <button class="btn btn--sm" type="button" (click)="applyPaste()">Add pasted IDs</button>
        </label>
      }

      @if (selected().length > 0) {
        <div class="chips">
          @for (user of selected(); track user.id) {
            <span class="chip">
              {{ user.displayName || user.username || user.id }}
              <button
                class="chip__remove"
                type="button"
                [attr.aria-label]="'Remove ' + (user.displayName || user.id)"
                (click)="remove(user.id)"
              >
                ×
              </button>
            </span>
          }
        </div>
      } @else {
        <span class="field__hint">No users selected yet.</span>
      }
    </div>
  `,
})
export class CampaignAudiencePickerComponent {
  private readonly _users = inject(UsersService);
  private readonly _destroyRef = inject(DestroyRef);

  public readonly selected = input<UserSummary[]>([]);
  public readonly selectedChange = output<UserSummary[]>();

  protected readonly query = signal<string>('');
  protected readonly results = signal<UserSummary[]>([]);
  protected readonly searching = signal<boolean>(false);
  protected readonly searched = signal<boolean>(false);
  protected readonly pasteMode = signal<boolean>(false);
  protected readonly pasteText = signal<string>('');

  private readonly _selectedIds = computed<Set<string>>(
    () => new Set(this.selected().map((u) => u.id)),
  );
  protected readonly visibleResults = computed<UserSummary[]>(() =>
    this.results().filter((u) => !this._selectedIds().has(u.id)),
  );

  protected search(): void {
    const q = this.query().trim();
    if (!q) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.searching.set(true);
    this.searched.set(false);
    this._users
      .searchSummaries({ q }, { limit: 20 })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.searching.set(false);
        this.searched.set(true);
        this.results.set(res?.items ?? []);
      });
  }

  protected add(user: UserSummary): void {
    if (this._selectedIds().has(user.id)) {
      return;
    }
    this.selectedChange.emit([...this.selected(), user]);
  }

  protected remove(id: string): void {
    this.selectedChange.emit(this.selected().filter((u) => u.id !== id));
  }

  protected applyPaste(): void {
    const known = this._selectedIds();
    const pasted = [...new Set(toLines(this.pasteText()))].filter((id) => !known.has(id));
    if (pasted.length === 0) {
      this.pasteText.set('');
      return;
    }
    this.selectedChange.emit([...this.selected(), ...pasted.map(placeholderUser)]);
    this.pasteText.set('');
  }
}
