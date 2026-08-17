import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { TraceApiService } from '../../data-access/trace-api.service';
import { Personal0DteWatchResponse, Personal0DteWatchState } from './personal-0dte-watch.models';

@Component({
  selector: 'app-personal-0dte-watch',
  templateUrl: './personal-0dte-watch.component.html',
  styleUrls: ['./personal-0dte-watch.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class Personal0DteWatchComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) date = '';
  @Input() captureTs: string | null = null;

  readonly watch = signal<Personal0DteWatchResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private request: Subscription | null = null;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.watch.set(null);
    this.error.set(null);
    if (!this.date || !this.captureTs) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.api.personal0DteWatch(this.date, this.captureTs).subscribe({
      next: response => {
        this.watch.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('The personal 0DTE study is unavailable for this capture.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  stateClass(state: Personal0DteWatchState): string {
    return `personal-watch__state--${state}`;
  }

  directionLabel(direction: 'bull_put' | 'bear_call'): string {
    return direction === 'bull_put' ? 'Bull put' : 'Bear call';
  }

  formatLevel(value: number | null | undefined): string {
    return value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  shortZone(response: Personal0DteWatchResponse): string {
    const zone = response.setup?.short_strike_zone;
    return zone?.length === 2
      ? `${this.formatLevel(zone[0])}–${this.formatLevel(zone[1])}`
      : 'Verify live chain';
  }
}
