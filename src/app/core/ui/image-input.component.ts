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

import { UploadService } from '../api/upload.service';
import { NotificationService } from './notification.service';

/**
 * Media field that accepts BOTH a pasted URL and a local upload. The URL is the
 * value (two-way via `value`/`valueChange`); uploading fills it with the
 * absolute inline URL returned by the gateway. Shows a thumbnail + clear.
 *
 * `kind` switches between an image (default) and a video: it drives the file
 * `accept` filter and whether the thumbnail renders as `<img>` or `<video>`.
 */
@Component({
  selector: 'app-image-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="image-input">
      <div class="image-input__row">
        <input
          class="input"
          type="url"
          [attr.aria-label]="label()"
          [placeholder]="placeholder()"
          [ngModel]="value()"
          (ngModelChange)="valueChange.emit($event)"
        />
        <label class="btn btn--sm" [class.btn--busy]="uploading()">
          {{ uploading() ? 'Uploading…' : 'Upload' }}
          <input
            type="file"
            [attr.accept]="accept()"
            hidden
            [disabled]="uploading()"
            (change)="onFile($event)"
          />
        </label>
        @if (value()) {
          <button class="btn btn--sm btn--ghost" type="button" (click)="valueChange.emit('')">
            Clear
          </button>
        }
      </div>
      @if (value()) {
        @if (kind() === 'video') {
          <video class="image-input__thumb" [src]="value()" controls playsinline></video>
        } @else {
          <img class="image-input__thumb" [src]="value()" alt="" />
        }
      }
      @if (error(); as message) {
        <span class="field__error">{{ message }}</span>
      }
    </div>
  `,
})
export class ImageInputComponent {
  private readonly _upload = inject(UploadService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  public readonly value = input<string>('');
  public readonly label = input<string>('Image URL');
  public readonly placeholder = input<string>('https://… or upload');
  public readonly kind = input<'image' | 'video'>('image');
  public readonly valueChange = output<string>();

  protected readonly accept = computed(() => (this.kind() === 'video' ? 'video/*' : 'image/*'));

  protected readonly uploading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected onFile(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    target.value = '';
    if (!file) {
      return;
    }
    const noun = this.kind() === 'video' ? 'Video' : 'Image';
    this.uploading.set(true);
    this.error.set(null);
    this._upload
      .uploadFile(file)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (url) => {
          this.uploading.set(false);
          this.valueChange.emit(url);
          this._notify.success(`${noun} uploaded.`);
        },
        error: () => {
          this.uploading.set(false);
          this.error.set('Upload failed. Check the file and try again.');
          this._notify.error(`${noun} upload failed.`);
        },
      });
  }
}
