import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import type { BacktestScorecardPolicy, PaperBacktestScorecard } from '../../data-access/paper.models';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperScorecardComponent } from './paper-scorecard.component';

function policy(id: string, label: string, net: number, totals: Record<string, number>, overrides: Partial<BacktestScorecardPolicy['summary']> = {}): BacktestScorecardPolicy {
  return { id, label, trades: [], versus_reference: id === 'recorded-rules' ? null : { sessions: 1, difference_dollars: 505 },
    summary: { admitted: 7, closed: 5, censored: 0, net_dollars: net, net_per_trade: net / 5, win_rate: 0.8, break_even_win_rate: 0.2,
      worst_session: Math.min(...Object.values(totals)), session_totals: totals, exit_reasons: {}, ...overrides } };
}

const card: PaperBacktestScorecard = {
  schema_version: 'paper-backtest-scorecard.v1', from_date: '2026-10-19', sessions: ['2026-10-19', '2026-10-20'],
  reference_policy: 'recorded-rules', cost_per_trade_dollars: 12.6, order_submission_enabled: false,
  policies: [policy('recorded-rules', 'Reference: live baseline rules', 529, { '2026-10-19': -78, '2026-10-20': 607 }, { censored: 2 }),
             policy('H1-hold', 'H1 hold to expiry', 1514, { '2026-10-19': 402, '2026-10-20': 1112 })],
};

describe('PaperScorecardComponent', () => {
  let api: { paperBacktestScorecard: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { paperBacktestScorecard: vi.fn(() => of(card)) };
    await TestBed.configureTestingModule({ imports: [PaperScorecardComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  it('shows the live rules first and each arm with net, per-session totals and the gap to live', () => {
    const fixture = TestBed.createComponent(PaperScorecardComponent);
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>)
      .map(row => Array.from(row.children).map(cell => cell.textContent?.replace(/\s+/g, ' ').trim()));
    expect(rows[0]).toEqual(['Reference: live baseline rules2 unresolved', '5', '+$529', '+$106', '80%', '−$78', '—', '−$78', '+$607']);
    expect(rows[1]).toEqual(['H1 hold to expiry', '5', '+$1,514', '+$303', '80%', '+$402', '+$505', '+$402', '+$1,112']);
    expect(fixture.nativeElement.querySelector('tr[data-reference="true"] .partial').textContent).toBe('2 unresolved');
    expect(fixture.nativeElement.textContent).toContain('Net after $12.60 per trade');
  });

  it('says when the scorecard is unavailable', () => {
    api.paperBacktestScorecard.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(PaperScorecardComponent);
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Paper scorecard unavailable.');
  });
});
