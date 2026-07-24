import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { SectionSpacing } from './campaigns.models';

interface SliderRow {
  key: keyof SectionSpacing;
  label: string;
}

/**
 * Slider editor for ONE section's spacing: padding (top/right/bottom/left) and
 * the bottom margin (gap to the next section), all in pixels. Emits a new
 * `SectionSpacing` object on every change (never mutates the input).
 */
@Component({
  selector: 'app-section-spacing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="spacing-editor">
      @for (row of rows; track row.key) {
        <div class="slider-row">
          <span class="slider-row__label">{{ row.label }}</span>
          <input
            class="slider"
            type="range"
            min="0"
            [max]="max()"
            step="1"
            [attr.aria-label]="label() + ' — ' + row.label"
            [ngModel]="val(row.key)"
            (ngModelChange)="update(row.key, $event)"
          />
          <output class="slider-row__value">{{ val(row.key) }}</output>
        </div>
      }
    </div>
  `,
})
export class SectionSpacingComponent {
  public readonly label = input<string>('Section');
  public readonly max = input<number>(64);
  public readonly value = input.required<SectionSpacing>();
  public readonly valueChange = output<SectionSpacing>();

  protected readonly rows: readonly SliderRow[] = [
    { key: 'paddingTop', label: 'Padding top' },
    { key: 'paddingRight', label: 'Padding right' },
    { key: 'paddingBottom', label: 'Padding bottom' },
    { key: 'paddingLeft', label: 'Padding left' },
    { key: 'marginBottom', label: 'Gap below' },
  ];

  protected val(key: keyof SectionSpacing): number {
    return this.value()[key];
  }

  protected coerce(raw: number | string | null): number {
    const n = typeof raw === 'string' ? Number(raw) : (raw ?? 0);
    if (!Number.isFinite(n)) {
      return 0;
    }
    return Math.min(256, Math.max(0, Math.round(n)));
  }

  protected update(key: keyof SectionSpacing, raw: number | string | null): void {
    this.valueChange.emit({ ...this.value(), [key]: this.coerce(raw) });
  }
}
