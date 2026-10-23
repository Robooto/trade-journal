import { TestBed } from '@angular/core/testing';
import type { BacktestScorecardPolicy, PaperBacktestScorecard } from '../../data-access/paper.models';
import { PaperScorecardComponent } from './paper-scorecard.component';

function policy(id: string, label: string, net: number, totals: Record<string, number>, overrides: Partial<BacktestScorecardPolicy['summary']> = {}): BacktestScorecardPolicy {
  return { id, label, trades: [], versus_reference: id === 'recorded-rules' ? null : { sessions: 1, difference_dollars: 505 },
    summary: { admitted: 7, closed: 5, censored: 0, net_dollars: net, net_per_trade: net / 5, win_rate: 0.8, break_even_win_rate: 0.2,
      worst_session: Math.min(...Object.values(totals)), session_totals: totals, exit_reasons: {}, ...overrides } };
}

const card: PaperBacktestScorecard = {
  schema_version: 'paper-backtest-scorecard.v1', from_date: '2026-10-19', to_date: '2026-12-11', sessions: ['2026-10-19', '2026-10-20'],
  reference_policy: 'recorded-rules', cost_per_trade_dollars: 4.88, cost_if_settled_dollars: 3.44, order_submission_enabled: false,
  policies: [policy('recorded-rules', 'Reference: live baseline rules', 529, { '2026-10-19': -78, '2026-10-20': 607 }, { censored: 2 }),
             policy('H1-hold', 'H1 hold to expiry', 1514, { '2026-10-19': 402, '2026-10-20': 1112 })],
};

describe('PaperScorecardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaperScorecardComponent] }).compileComponents();
  });

  function render(input: Partial<{ card: PaperBacktestScorecard | null; error: boolean }>) {
    const fixture = TestBed.createComponent(PaperScorecardComponent);
    for (const [key, value] of Object.entries(input)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  it('says what is being tested and how far along it is', () => {
    const banner = render({ card }).nativeElement.querySelector('.test-banner').textContent.replace(/\s+/g, ' ');
    expect(banner).toContain('1 bot + 1 exit rules on the same trades');
    expect(banner).toContain('Oct 19 – Dec 11');
    expect(banner).toContain('Session 2 of 20 to the first read');
  });

  it('shows the bot first and each rule with net, per-session totals and the gap to the bot', () => {
    const fixture = render({ card });
    const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>)
      .map(row => Array.from(row.children).map(cell => cell.textContent?.replace(/\s+/g, ' ').trim()));
    expect(rows[0]).toEqual(['Bot (live rules)2 unresolved', '5', '+$529', '+$106', '80%', '−$78', '—', '−$78', '+$607']);
    expect(rows[1]).toEqual(['H1 hold to expiry', '5', '+$1,514', '+$303', '80%', '+$402', '+$505', '+$402', '+$1,112']);
    expect(fixture.nativeElement.querySelector('tr[data-reference="true"] .partial').textContent).toBe('2 unresolved');
    expect(fixture.nativeElement.textContent).toContain('Net after $4.88 per closed trade, $3.44 held to settlement');
  });

  it('says when the scorecard is unavailable', () => {
    expect(render({ error: true }).nativeElement.textContent).toContain('Paper scorecard unavailable.');
  });
});
