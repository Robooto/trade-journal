import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import type { PaperResearchScorecard } from '../../data-access/generated/research-contracts';
import { researchScorecardForTest } from '../../data-access/paper-research-scorecard.fixture';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperResearchHealthComponent } from './paper-research-health.component';

describe('PaperResearchHealthComponent', () => {
  let api: { paperResearchScorecard: ReturnType<typeof vi.fn<(date: string) => Observable<PaperResearchScorecard>>> };
  beforeEach(async () => {
    api = { paperResearchScorecard: vi.fn((date: string) => of(researchScorecardForTest(date))) };
    await TestBed.configureTestingModule({
      imports: [PaperResearchHealthComponent], providers: [{ provide: TraceApiService, useValue: api }],
    }).compileComponents();
  });

  it('shows width gaps separately from trading performance', () => {
    const report = researchScorecardForTest('2026-10-13', {
      status: 'attention', attention_reasons: ['width_evidence_incomplete'], capacity_gap_count: 2,
      requests: { used: 20, maximum_daily_requests: 500, failed: 0, pending: 0,
        maximum_duration_seconds: null, maximum_quote_symbols: null, blocked_reasons: [] },
      runtime: { last_tick_started_at: null, maximum_tick_seconds: 8 },
      source_signal_coverage: { expected_elapsed_slots: 6, missing_slots: 1, invalid_slots: 0, complete_session: false },
      widths: [{ width_points: 20, opportunities: 2, valid_entries: 1, unavailable_entries: 1,
        pending_entries: 0, expected_quote_minutes: 30, valid_quote_minutes: 25, invalid_quote_minutes: 2,
        missing_quote_minutes: 3, entry_failure_reasons: { chain_not_cached_at_onset: 1 },
        quote_failure_reasons: { stale_quote: 2 }, maximum_quote_age_seconds: null, last_quote_received_at: null }],
    });
    api.paperResearchScorecard.mockReturnValue(of(report));
    const fixture = TestBed.createComponent(PaperResearchHealthComponent);
    fixture.componentRef.setInput('date', report.date); fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.width-health');
    expect(panel.textContent).toContain('0 common valid entries');
    expect(panel.textContent).toContain('width evidence incomplete');
    expect(panel.textContent).toContain('chain not cached at onset');
    expect(panel.textContent).toContain('Trading profits and losses do not change this status');
    expect(panel.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('reports a failed health request without showing healthy zero counts', () => {
    api.paperResearchScorecard.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(PaperResearchHealthComponent);
    fixture.componentRef.setInput('date', '2026-10-13'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.width-health').textContent).toContain('status unavailable');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });

  it('cancels prior requests and prevents an old date from replacing current health', () => {
    const old = new Subject<PaperResearchScorecard>();
    const current = new Subject<PaperResearchScorecard>();
    const cancelled = vi.fn();
    api.paperResearchScorecard.mockReturnValueOnce(new Observable(subscriber => {
      const subscription = old.subscribe(subscriber);
      return () => { subscription.unsubscribe(); cancelled(); };
    })).mockReturnValueOnce(current);
    const fixture = TestBed.createComponent(PaperResearchHealthComponent);
    fixture.componentRef.setInput('date', '2026-10-13'); fixture.detectChanges();
    fixture.componentRef.setInput('date', '2026-10-14'); fixture.detectChanges();
    expect(cancelled).toHaveBeenCalledOnce();
    old.next(researchScorecardForTest('2026-10-13', { status: 'complete' }));
    expect(fixture.componentInstance.health()).toBeNull();
    current.next(researchScorecardForTest('2026-10-14', { status: 'collecting' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('2026-10-14');
    expect(fixture.nativeElement.textContent).not.toContain('2026-10-13');
    fixture.destroy();
    expect(current.observed).toBe(false);
  });

  it('clears the previous panel and request when the selected date is cleared', () => {
    const response = new Subject<PaperResearchScorecard>();
    api.paperResearchScorecard.mockReturnValue(response);
    const fixture = TestBed.createComponent(PaperResearchHealthComponent);
    fixture.componentRef.setInput('date', '2026-10-13'); fixture.detectChanges();
    response.next(researchScorecardForTest('2026-10-13', { status: 'collecting' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.width-health')).not.toBeNull();
    fixture.componentRef.setInput('date', ''); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.width-health')).toBeNull();
    expect(response.observed).toBe(false);
    expect(api.paperResearchScorecard).toHaveBeenCalledOnce();
  });
});
