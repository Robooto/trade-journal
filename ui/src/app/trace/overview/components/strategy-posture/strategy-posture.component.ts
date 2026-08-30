import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { TraceApiService } from '../../data-access/trace-api.service';
import {
  StrategyPosture,
  StrategyPostureResponse,
  StrategyPostureStatus,
} from './strategy-posture.models';

@Component({
  selector: 'app-strategy-posture',
  templateUrl: './strategy-posture.component.html',
  styleUrls: ['./strategy-posture.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class StrategyPostureComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) date = '';
  @Input() captureTs: string | null = null;

  readonly posture = signal<StrategyPostureResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private request: Subscription | null = null;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.posture.set(null);
    this.error.set(null);
    if (!this.date || !this.captureTs) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.request = this.api.strategyPosture(this.date, this.captureTs).subscribe({
      next: response => {
        if (response.research.scoring_enabled || response.protocol.automatic_scoring) {
          this.error.set('Shadow posture blocked because scoring is unexpectedly enabled.');
          this.posture.set(null);
        } else {
          this.posture.set(response);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('The strategy-posture shadow study is unavailable for this capture.');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
  }

  statusClass(status: StrategyPostureStatus): string {
    return `strategy-posture__state--${status}`;
  }

  postureLabel(posture: StrategyPosture | null): string {
    if (posture === 'bull_put_credit_watch') return 'Bull put credit watch';
    if (posture === 'bear_call_credit_watch') return 'Bear call credit watch';
    if (posture === 'stand_aside') return 'Stand aside';
    return 'No posture available';
  }

  reasonLabel(reason: string): string {
    return reason.replaceAll('_', ' ');
  }

  formatLevel(value: number | null | undefined): string {
    return value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  hiroLabel(value: number | null): string {
    if (value == null) return 'Unavailable';
    if (value > 0) return 'Positive';
    if (value < 0) return 'Negative';
    return 'Flat';
  }
}
