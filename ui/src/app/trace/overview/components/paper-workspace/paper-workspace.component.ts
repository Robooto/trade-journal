import { ChangeDetectionStrategy, Component, Input, computed, effect } from '@angular/core';
import { TraceFacade } from '../../data-access/trace.facade';

/** Paper-only view state. Session selection and requests remain owned by TraceFacade. */
@Component({
  selector: 'app-paper-workspace',
  standalone: false,
  templateUrl: './paper-workspace.component.html',
  styleUrl: './paper-workspace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperWorkspaceComponent {
  @Input() active = false;
  @Input() refreshAt: Date | null = null;
  paperFromDate = '';
  paperToDate = '';
  selectedReplayEntry = '';
  ledgerFromDate = ''; ledgerToDate = '';
  ledgerExpanded = false;
  private scorecardRangeInitialized = false;
  readonly latestPaperDate = computed(() => this.facade.sessions().map(session => session.date).sort().at(-1) ?? '');

  constructor(readonly facade: TraceFacade) {
    effect(() => {
      const sessions = this.facade.sessions();
      if (!this.scorecardRangeInitialized && sessions.length) {
        const dates = sessions.map(session => session.date).sort();
        this.paperFromDate = dates[Math.max(0, dates.length - 10)];
        this.paperToDate = dates[dates.length - 1];
        this.scorecardRangeInitialized = true;
      }
    });
    effect(() => {
      const entries = this.facade.paperReplayEntries()?.entries ?? [];
      const cutoff = this.facade.selectedCapture()?.ts;
      const eligible = cutoff ? entries.filter(entry => entry.strategy_id !== 'spx-structure-iron-condor.v1' && entry.ts <= cutoff) : [];
      this.selectedReplayEntry = eligible.some(entry => this.replayEntryKey(entry) === this.selectedReplayEntry)
        ? this.selectedReplayEntry
        : (eligible.length ? this.replayEntryKey(eligible[eligible.length - 1]) : '');
    });
  }

  submitPaperRange(): void {
    const dates = this.facade.sessions().map(session => session.date).sort();
    this.facade.loadPaperScorecard(
      this.paperFromDate || dates[Math.max(0, dates.length - 10)],
      this.paperToDate || dates[dates.length - 1],
    );
  }

  replaySelectedTrade(): void {
    const capture = this.facade.selectedCapture();
    const date = this.facade.selectedDate();
    const entry = this.eligibleReplayEntries().find(row => this.replayEntryKey(row) === this.selectedReplayEntry);
    if (capture && date && entry) this.facade.loadPaperReplay(date, capture.capture_id, entry.capture_id, entry.strategy_id);
  }

  replayEntryKey(entry: { capture_id: string; strategy_id?: string }): string {
    return `${entry.strategy_id || 'spx-directional-vertical.v1'}:${entry.capture_id}`;
  }

  eligibleReplayEntries() {
    const cutoff = this.facade.selectedCapture()?.ts;
    return (this.facade.paperReplayEntries()?.entries ?? []).filter(entry => entry.strategy_id !== 'spx-structure-iron-condor.v1' && (!cutoff || entry.ts <= cutoff));
  }

  selectReplayEntry(value: string): void {
    this.selectedReplayEntry = value;
    this.facade.clearPaperReplay();
  }

  formatMoney(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `$${value.toFixed(0)}`;
  }

  formatPercent(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${(value * 100).toFixed(0)}%`;
  }

  formatTimestamp(value: string | null | undefined): string {
    if (!value) return 'Unavailable';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed);
  }

}
