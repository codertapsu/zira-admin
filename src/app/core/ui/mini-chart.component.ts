import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

interface BarView {
  readonly label: string;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Dependency-free inline-SVG chart (line or bar) for small admin dashboards.
 * Theme-aware via CSS custom properties (uses --primary / --text-3 / --border).
 * Pass `points`; the component scales to a fixed 100×h viewBox and stretches to
 * its container width.
 */
@Component({
  selector: 'app-mini-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length > 0) {
      <svg
        class="mini-chart"
        [attr.viewBox]="'0 0 100 ' + height()"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="ariaLabel()"
      >
        @if (type() === 'line') {
          <polyline class="mini-chart__line" [attr.points]="linePoints()" />
          @for (p of dots(); track p.label) {
            <circle class="mini-chart__dot" [attr.cx]="p.x" [attr.cy]="p.y" r="0.9" />
          }
        } @else {
          @for (b of bars(); track b.label) {
            <rect
              class="mini-chart__bar"
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="b.w"
              [attr.height]="b.h"
            />
          }
        }
        <line class="mini-chart__axis" x1="0" [attr.y1]="height()" x2="100" [attr.y2]="height()" />
      </svg>
    } @else {
      <p class="mini-chart__empty sub">No data.</p>
    }
  `,
})
export class MiniChartComponent {
  public readonly points = input<ChartPoint[]>([]);
  public readonly type = input<'line' | 'bar'>('line');
  public readonly height = input<number>(32);
  public readonly ariaLabel = input<string>('chart');

  private readonly _max = computed<number>(() => {
    const values = this.points().map((p) => p.value);
    return Math.max(1, ...values);
  });

  protected readonly dots = computed<{ label: string; x: number; y: number }[]>(() => {
    const pts = this.points();
    const h = this.height();
    const max = this._max();
    const step = pts.length > 1 ? 100 / (pts.length - 1) : 0;
    return pts.map((p, i) => ({
      label: p.label,
      x: pts.length > 1 ? i * step : 50,
      y: h - (p.value / max) * (h - 2) - 1,
    }));
  });

  protected readonly linePoints = computed<string>(() =>
    this.dots()
      .map((d) => `${d.x.toFixed(2)},${d.y.toFixed(2)}`)
      .join(' '),
  );

  protected readonly bars = computed<BarView[]>(() => {
    const pts = this.points();
    const h = this.height();
    const max = this._max();
    const slot = 100 / pts.length;
    const w = Math.max(0.5, slot * 0.7);
    const pad = (slot - w) / 2;
    return pts.map((p, i) => {
      const barH = (p.value / max) * (h - 2);
      return {
        label: p.label,
        value: p.value,
        x: i * slot + pad,
        y: h - barH - 1,
        w,
        h: barH,
      };
    });
  });
}
