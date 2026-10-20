import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { TraceCollectionStatus } from '../../trace.models';

/** Minutes after which the latest capture counts as stale during the session. */
const STALE_MINUTES = 12;

/** One line: what TRACE and the chain grid recorded for the session. Replaces the research-health panel. */
@Component({
  selector: 'app-collection-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collection-status.component.html',
  styleUrl: './collection-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionStatusComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() refreshAt: Date | null = null;
  /** Injected for tests; defaults to the current time. */
  @Input() now: () => Date = () => new Date();
  readonly status = signal<TraceCollectionStatus | null>(null);
  readonly error = signal(false);
  private request?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.error.set(false);
    if (!this.date) { this.status.set(null); return; }
    this.request = this.api.collectionStatus(this.date).subscribe({
      next: value => this.status.set(value),
      error: () => { this.status.set(null); this.error.set(true); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  /** 'live', 'stale' (no capture for 12+ minutes during 6:30-13:00 Pacific today), or 'closed'. */
  state(status: TraceCollectionStatus): 'live' | 'stale' | 'closed' {
    const now = this.now();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    if (status.date !== today || clock < '06:30' || clock > '13:05') return 'closed';
    const latest = status.trace.latest_ts ? new Date(status.trace.latest_ts).getTime() : 0;
    return (now.getTime() - latest) / 60000 > STALE_MINUTES ? 'stale' : 'live';
  }

  time(ts: string | null): string {
    if (!ts) return '—';
    const date = new Date(ts);
    return Number.isNaN(date.getTime()) ? ts : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(date);
  }
}
