import { ChangeDetectionStrategy, Component, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { TraceApiService } from '../../data-access/trace-api.service';
import {
  DecisionStatus,
  Spx0DteDecision,
  Spx0DteDecisionJournalResponse,
  Spx0DteHumanDecision,
  Spx0DteTradeType,
} from './decision-journal.models';

@Component({
  selector: 'app-decision-journal',
  templateUrl: './decision-journal.component.html',
  styleUrls: ['./decision-journal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DecisionJournalComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) date = '';
  @Input() captureTs: string | null = null;
  @Input() captureId: string | null = null;

  readonly systemDecision = signal<Spx0DteDecisionJournalResponse | null>(null);
  readonly humanDecision = signal<Spx0DteHumanDecision | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);

  humanChoice: Spx0DteDecision = 'pass';
  humanTradeType: Spx0DteTradeType | null = null;
  humanNotes = '';

  private requests = new Subscription();

  constructor(private readonly api: TraceApiService) {}

  ngOnChanges(): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.systemDecision.set(null);
    this.humanDecision.set(null);
    this.error.set(null);
    this.saveError.set(null);
    this.humanChoice = 'pass';
    this.humanTradeType = null;
    this.humanNotes = '';
    if (!this.date || !this.captureTs || !this.captureId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.requests.add(this.api.decisionJournal(this.date, this.captureTs).subscribe({
      next: response => {
        this.systemDecision.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('The SPX 0DTE Decision Journal is unavailable for this capture.');
        this.loading.set(false);
      },
    }));
    this.requests.add(this.api.human0DteDecision(this.date, this.captureId).subscribe({
      next: response => this.humanDecision.set(response.rows[0] ?? null),
      error: () => this.saveError.set('Your saved decision could not be loaded.'),
    }));
  }

  ngOnDestroy(): void {
    this.requests.unsubscribe();
  }

  chooseHumanDecision(decision: Spx0DteDecision): void {
    this.humanChoice = decision;
    if (decision === 'pass') this.humanTradeType = null;
  }

  saveHumanDecision(): void {
    if (!this.date || !this.captureTs || !this.captureId || this.humanDecision()) return;
    if (this.humanChoice === 'take' && this.humanTradeType === null) {
      this.saveError.set('Choose bull put or bear call before saving a take.');
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    this.requests.add(this.api.createHuman0DteDecision({
      session_date: this.date,
      trace_ts: this.captureTs,
      capture_id: this.captureId,
      decision: this.humanChoice,
      trade_type: this.humanTradeType,
      notes: this.humanNotes.trim() || null,
    }).subscribe({
      next: response => {
        this.humanDecision.set(response);
        this.saving.set(false);
      },
      error: response => {
        this.saveError.set(response?.status === 409
          ? 'A human decision is already frozen for this capture.'
          : 'Your decision could not be saved.');
        this.saving.set(false);
      },
    }));
  }

  statusClass(status: DecisionStatus): string {
    return `decision-journal__state--${status}`;
  }

  decisionClass(decision: Spx0DteDecision): string {
    return `decision-journal__decision--${decision}`;
  }

  label(value: string | null | undefined): string {
    return value ? value.replaceAll('_', ' ') : 'None';
  }

  formatLevel(value: number | null | undefined): string {
    return value == null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  formatOnset(value: string): string {
    return new Date(value).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit',
    });
  }
}
