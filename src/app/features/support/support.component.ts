import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { catchError, of } from 'rxjs';

import { SupportService } from './support.service';
import type {
  EventLookup,
  ProjectLookup,
  SupportLookupKind,
  SupportUserSummary,
  TaskLookup,
  TaskVersionLookup,
} from './support.models';

/**
 * Read-only support-desk lookup: paste a project / task / event id and view
 * its detail, membership, and (for tasks) its `task_versions` change trail.
 * Nothing on this screen mutates data — it mirrors the gateway's
 * `admin/support/*` lookup routes, which bypass membership ACL for
 * Admin/Staff so a ticket's id is enough to inspect it.
 */
@Component({
  selector: 'app-support',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Support lookup</h1>
      </header>
      <p class="muted">
        Read-only lookup for support — paste an id to inspect it. Nothing here can be edited or
        deleted.
      </p>

      <nav class="tabs" aria-label="Lookup type" style="margin-top: 16px">
        <button
          class="tab"
          type="button"
          [class.is-active]="kind() === 'project'"
          [attr.aria-pressed]="kind() === 'project'"
          (click)="selectKind('project')"
        >
          Project
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="kind() === 'task'"
          [attr.aria-pressed]="kind() === 'task'"
          (click)="selectKind('task')"
        >
          Task
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="kind() === 'event'"
          [attr.aria-pressed]="kind() === 'event'"
          (click)="selectKind('event')"
        >
          Event
        </button>
      </nav>

      <div class="card" style="padding: 20px; margin-top: 16px">
        <div class="toolbar">
          <input
            class="input"
            type="text"
            aria-label="Id to look up"
            placeholder="Paste a {{ kind() }} id…"
            style="max-width: 420px"
            [ngModel]="idInput()"
            (ngModelChange)="idInput.set($event)"
            (keyup.enter)="lookUp()"
          />
          <button
            class="btn btn--primary btn--sm"
            type="button"
            [disabled]="loading()"
            (click)="lookUp()"
          >
            {{ loading() ? 'Looking up…' : 'Look up' }}
          </button>
        </div>
        @if (fieldError(); as message) {
          <p class="field__error" style="margin-top: 8px">{{ message }}</p>
        }
      </div>

      <div style="margin-top: 16px">
        @if (loading()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (error(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="lookUp()">Retry</button>
          </div>
        } @else if (kind() === 'project' && project(); as p) {
          <div class="detail">
            <div class="card" style="padding: 20px">
              <p class="section-title">{{ p.name }}</p>
              <dl class="kv" style="margin-top: 12px">
                <div>
                  <dt class="kv__key">Status</dt>
                  <dd class="kv__val">
                    <span class="badge badge--muted">{{ humanize(p.status) }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="kv__key">Description</dt>
                  <dd class="kv__val">{{ p.description || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Manager id</dt>
                  <dd class="kv__val">{{ p.managerId || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Subscription</dt>
                  <dd class="kv__val">{{ humanize(p.subscriptionType) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Start date</dt>
                  <dd class="kv__val">{{ formatDate(p.startDate) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">End date</dt>
                  <dd class="kv__val">{{ formatDate(p.endDate) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Created</dt>
                  <dd class="kv__val">{{ formatDate(p.createdAt) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Updated</dt>
                  <dd class="kv__val">{{ formatDate(p.updatedAt) }}</dd>
                </div>
              </dl>

              <div class="stat-grid" style="margin-top: 16px">
                <div class="stat">
                  <span class="stat__label">Members</span>
                  <span class="stat__value">{{ p.counts.members }}</span>
                </div>
                <div class="stat">
                  <span class="stat__label">Sprints</span>
                  <span class="stat__value">{{ p.counts.sprints }}</span>
                </div>
                <div class="stat">
                  <span class="stat__label">Tasks</span>
                  <span class="stat__value">{{ p.counts.tasks }}</span>
                </div>
              </div>
            </div>

            <div class="card" style="padding: 20px">
              <p class="section-title">Members</p>
              @if (p.members.length === 0) {
                <p class="state__empty" style="margin-top: 8px">No members.</p>
              } @else {
                <div class="table-wrap" style="margin-top: 12px">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (m of p.members; track m.userId) {
                        <tr>
                          <td>
                            <div class="table__name">{{ userLabel(m.user, m.userId) }}</div>
                            @if (m.user?.email) {
                              <div class="table__sub">{{ m.user.email }}</div>
                            }
                          </td>
                          <td>
                            <span class="badge badge--muted">{{ humanize(m.role) }}</span>
                          </td>
                          <td>{{ formatDate(m.joinedAt) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>

            <div class="card" style="padding: 20px">
              <p class="section-title">Sprints</p>
              @if (p.sprints.length === 0) {
                <p class="state__empty" style="margin-top: 8px">No sprints.</p>
              } @else {
                <div class="table-wrap" style="margin-top: 12px">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Start</th>
                        <th>End</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (s of p.sprints; track s.id) {
                        <tr>
                          <td class="table__name">{{ s.name }}</td>
                          <td>
                            <span class="badge badge--muted">{{ humanize(s.status) }}</span>
                          </td>
                          <td>{{ formatDate(s.startDate) }}</td>
                          <td>{{ formatDate(s.endDate) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        } @else if (kind() === 'task' && task(); as t) {
          <div class="detail">
            <div class="card" style="padding: 20px">
              <p class="section-title">{{ t.name }}</p>
              <dl class="kv" style="margin-top: 12px">
                <div>
                  <dt class="kv__key">Status</dt>
                  <dd class="kv__val">
                    <span class="badge badge--muted">{{ humanize(t.status) }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="kv__key">Priority</dt>
                  <dd class="kv__val">{{ humanize(t.priority) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Type</dt>
                  <dd class="kv__val">{{ humanize(t.taskType) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Version</dt>
                  <dd class="kv__val">{{ t.version }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Archived</dt>
                  <dd class="kv__val">{{ t.archive ? 'Yes' : 'No' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Description</dt>
                  <dd class="kv__val">{{ t.description || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Project</dt>
                  <dd class="kv__val">{{ t.projectName || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Sprint</dt>
                  <dd class="kv__val">{{ t.sprintName || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Start date</dt>
                  <dd class="kv__val">{{ formatDate(t.startDate) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">End date</dt>
                  <dd class="kv__val">{{ formatDate(t.endDate) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Created by</dt>
                  <dd class="kv__val">{{ t.createdById }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Created</dt>
                  <dd class="kv__val">{{ formatDate(t.createdAt) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Updated</dt>
                  <dd class="kv__val">{{ formatDate(t.updatedAt) }}</dd>
                </div>
              </dl>
            </div>

            <div class="card" style="padding: 20px">
              <p class="section-title">Assignees</p>
              @if (t.assignees.length === 0) {
                <p class="state__empty" style="margin-top: 8px">No assignees.</p>
              } @else {
                <div class="table-wrap" style="margin-top: 12px">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (a of t.assignees; track a.userId) {
                        <tr>
                          <td>
                            <div class="table__name">{{ userLabel(a.user, a.userId) }}</div>
                            @if (a.user?.email) {
                              <div class="table__sub">{{ a.user.email }}</div>
                            }
                          </td>
                          <td>{{ formatDate(a.assignedAt) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>

            <div class="card" style="padding: 20px">
              <p class="section-title">Change trail</p>
              <p class="muted">
                task_versions snapshot history for this task — every field snapshot is read-only.
              </p>
              @if (versionsLoading()) {
                <div class="state"><span class="spinner"></span></div>
              } @else if (versionsError(); as message) {
                <div class="state state--col">
                  <p class="state__error">{{ message }}</p>
                  <button class="btn btn--primary btn--sm" type="button" (click)="retryVersions()">
                    Retry
                  </button>
                </div>
              } @else if (versions().length === 0) {
                <p class="state__empty" style="margin-top: 8px">No versions recorded.</p>
              } @else {
                <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 10px">
                  @for (v of versions(); track v.id) {
                    <details class="card" style="padding: 12px 16px">
                      <summary
                        style="cursor: pointer; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap"
                      >
                        <span
                          ><strong>v{{ v.version }}</strong> —
                          {{ userLabel(v.modifier, v.modifierId) }}</span
                        >
                        <span class="muted">{{ formatDate(v.createdAt) }}</span>
                      </summary>
                      <pre
                        style="margin-top: 12px; padding: 12px; background: var(--surface-2); border-radius: var(--radius-sm); overflow-x: auto; font-family: var(--mono); font-size: 12px"
                        >{{ snapshotJson(v.snapshot) }}</pre>
                    </details>
                  }
                </div>
              }
            </div>
          </div>
        } @else if (kind() === 'event' && event(); as e) {
          <div class="detail">
            <div class="card" style="padding: 20px">
              <p class="section-title">{{ e.name }}</p>
              <dl class="kv" style="margin-top: 12px">
                <div>
                  <dt class="kv__key">Kind</dt>
                  <dd class="kv__val">{{ humanize(e.eventKind) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Color</dt>
                  <dd class="kv__val">
                    <span style="display: inline-flex; align-items: center; gap: 6px">
                      <span
                        style="width: 14px; height: 14px; border-radius: 999px; display: inline-block; border: 1px solid var(--border)"
                        [style.background]="e.color"
                      ></span>
                      {{ e.color }}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt class="kv__key">Icon</dt>
                  <dd class="kv__val">{{ e.icon || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Location</dt>
                  <dd class="kv__val">{{ e.location || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Timezone</dt>
                  <dd class="kv__val">{{ e.timezoneId || e.timezone }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Start</dt>
                  <dd class="kv__val">{{ formatDate(e.startDate) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">End</dt>
                  <dd class="kv__val">{{ formatDate(e.endDate) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Description</dt>
                  <dd class="kv__val">{{ e.description || '—' }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Created by</dt>
                  <dd class="kv__val">{{ e.createdById }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Created</dt>
                  <dd class="kv__val">{{ formatDate(e.createdAt) }}</dd>
                </div>
                <div>
                  <dt class="kv__key">Updated</dt>
                  <dd class="kv__val">{{ formatDate(e.updatedAt) }}</dd>
                </div>
              </dl>
            </div>

            <div class="card" style="padding: 20px">
              <p class="section-title">Participants</p>
              @if (e.participants.length === 0) {
                <p class="state__empty" style="margin-top: 8px">No participants.</p>
              } @else {
                <div class="table-wrap" style="margin-top: 12px">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Notify</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (pp of e.participants; track pp.userId) {
                        <tr>
                          <td>
                            <div class="table__name">{{ userLabel(pp.user, pp.userId) }}</div>
                            @if (pp.user?.email) {
                              <div class="table__sub">{{ pp.user.email }}</div>
                            }
                          </td>
                          <td>
                            @if (pp.notify) {
                              <span class="badge badge--ok">Yes</span>
                            } @else {
                              <span class="badge badge--muted">No</span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>

            <div class="card" style="padding: 20px">
              <p class="section-title">Alert schedule</p>
              @if (e.alerts.length === 0) {
                <p class="state__empty" style="margin-top: 8px">No alerts configured.</p>
              } @else {
                <div class="table-wrap" style="margin-top: 12px">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Offset</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (al of e.alerts; track al.id) {
                        <tr>
                          <td>{{ al.offsetValue }} {{ humanize(al.offsetUnit) }}</td>
                          <td>
                            <span class="badge badge--muted">{{ humanize(al.type) }}</span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="state state--col">
            <p class="state__empty">Choose a type, paste an id, and look it up.</p>
          </div>
        }
      </div>
    </section>
  `,
})
export class SupportComponent {
  private readonly _support = inject(SupportService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly kind = signal<SupportLookupKind>('project');
  protected readonly idInput = signal<string>('');
  protected readonly fieldError = signal<string | null>(null);

  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly project = signal<ProjectLookup | null>(null);
  protected readonly task = signal<TaskLookup | null>(null);
  protected readonly event = signal<EventLookup | null>(null);

  protected readonly versions = signal<TaskVersionLookup[]>([]);
  protected readonly versionsLoading = signal<boolean>(false);
  protected readonly versionsError = signal<string | null>(null);

  protected selectKind(next: SupportLookupKind): void {
    if (this.kind() === next) {
      return;
    }
    this.kind.set(next);
    this.error.set(null);
    this.fieldError.set(null);
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected userLabel(user: SupportUserSummary | null, fallbackId: string): string {
    if (user) {
      return user.displayName || user.email || fallbackId;
    }
    return fallbackId;
  }

  protected snapshotJson(snapshot: Record<string, unknown>): string {
    return JSON.stringify(snapshot, null, 2);
  }

  protected lookUp(): void {
    const id = this.idInput().trim();
    if (!id) {
      this.fieldError.set('Paste an id to look it up.');
      return;
    }
    this.fieldError.set(null);

    this.project.set(null);
    this.task.set(null);
    this.event.set(null);
    this.versions.set([]);
    this.versionsError.set(null);

    this.loading.set(true);
    this.error.set(null);

    switch (this.kind()) {
      case 'project':
        this._loadProject(id);
        break;
      case 'task':
        this._loadTask(id);
        break;
      case 'event':
        this._loadEvent(id);
        break;
    }
  }

  protected retryVersions(): void {
    const t = this.task();
    if (t) {
      this._loadVersions(t.id);
    }
  }

  private _loadProject(id: string): void {
    this._support
      .getProject(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (res === null) {
          this.error.set('Could not find a project with that id.');
          return;
        }
        this.project.set(res);
      });
  }

  private _loadTask(id: string): void {
    this._support
      .getTask(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (res === null) {
          this.error.set('Could not find a task with that id.');
          return;
        }
        this.task.set(res);
        this._loadVersions(res.id);
      });
  }

  private _loadVersions(taskId: string): void {
    this.versionsLoading.set(true);
    this.versionsError.set(null);
    this._support
      .getTaskVersions(taskId)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.versionsLoading.set(false);
        if (res === null) {
          this.versionsError.set('Could not load the change trail.');
          return;
        }
        this.versions.set(res);
      });
  }

  private _loadEvent(id: string): void {
    this._support
      .getEvent(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if (res === null) {
          this.error.set('Could not find an event with that id.');
          return;
        }
        this.event.set(res);
      });
  }
}
