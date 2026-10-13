import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import type { PaperResearchScorecard } from '../../data-access/generated/research-contracts';
import { TraceApiService } from '../../data-access/trace-api.service';

@Component({
  selector: 'app-paper-research-health',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paper-research-health.component.html',
  styleUrl: './paper-research-health.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperResearchHealthComponent implements OnChanges, OnDestroy {
  @Input() date = '';
  @Input() refreshAt: Date | null = null;
  readonly health = signal<PaperResearchScorecard | null>(null);
  readonly error = signal(false);
  private request?: Subscription;

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.request?.unsubscribe();
    this.health.set(null);
    this.error.set(false);
    if (!this.date) return;
    this.request = this.api.paperResearchScorecard(this.date).subscribe({
      next: value => this.health.set(value),
      error: () => this.error.set(true),
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }
}
