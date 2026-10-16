import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import type { PaperArm, PaperArmScorecard } from '../../data-access/generated/research-contracts';
import { TraceApiService } from '../../data-access/trace-api.service';

const STATUS: Record<PaperArm['status'], string> = {
  control: 'Control', collecting: 'Collecting', ready_for_review: 'Ready for review', ended: 'Ended',
};

/** Every paper arm on one cost basis, with progress to its review floor. Paper only. */
@Component({
  selector: 'app-paper-arms',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-arms.component.html',
  styleUrl: './paper-arms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperArmsComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() refreshAt: Date | null = null;
  readonly scorecard = signal<PaperArmScorecard | null>(null);
  readonly error = signal(false);
  private request?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.error.set(false);
    if (!this.date) { this.scorecard.set(null); return; }
    this.request = this.api.paperArms(this.date).subscribe({
      next: value => this.scorecard.set(value),
      error: () => { this.scorecard.set(null); this.error.set(true); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  money(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `${value < 0 ? '−' : value > 0 ? '+' : ''}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  status(arm: PaperArm): string { return STATUS[arm.status]; }

  progress(arm: PaperArm): string {
    if (arm.required_closes === null || arm.required_sessions === null) return 'No floor (comparison base)';
    return `${Math.min(arm.closes, arm.required_closes)}/${arm.required_closes} trades · ${Math.min(arm.sessions, arm.required_sessions)}/${arm.required_sessions} sessions`;
  }

  fraction(arm: PaperArm): number {
    if (!arm.required_closes || !arm.required_sessions) return 0;
    return Math.min(1, arm.closes / arm.required_closes, arm.sessions / arm.required_sessions);
  }
}
