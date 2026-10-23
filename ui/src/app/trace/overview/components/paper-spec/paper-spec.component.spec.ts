import { TestBed } from '@angular/core/testing';
import type { BacktestScorecardPolicy, PaperBacktestScorecard } from '../../data-access/paper.models';
import { PaperSpecComponent } from './paper-spec.component';

function policy(id: string, label: string, comparedTo: string | null, net: number, totals: Record<string, number>,
                difference: number | null = null): BacktestScorecardPolicy {
  return { id, label, trades: [], compared_to: comparedTo,
    versus_reference: difference === null ? null : { sessions: 1, difference_dollars: difference },
    summary: { admitted: 3, closed: 3, censored: 0, net_dollars: net, net_per_trade: net / 3, win_rate: 2 / 3, break_even_win_rate: 0.2,
      worst_session: Math.min(...Object.values(totals)), session_totals: totals, exit_reasons: {} } };
}

const base = { schema_version: 'paper-backtest-scorecard.v1' as const, from_date: '2026-10-22', to_date: '2026-12-11',
  reference_policy: 'recorded-rules', cost_per_trade_dollars: 4.88, cost_if_settled_dollars: 3.44, order_submission_enabled: false as const };

const card: PaperBacktestScorecard = { ...base, sessions: ['2026-10-22'], policies: [
  policy('recorded-rules', 'Reference and live-exit control: live baseline rules', null, -120, { '2026-10-22': -120 }),
  policy('S-live-node', 'Live exits, skip a negative node in the path (F1)', 'recorded-rules', 40, { '2026-10-22': 40 }, 160),
  policy('S-hold', 'Hold-exit control: hold to expiry (same rules as H1)', 'recorded-rules', 300, { '2026-10-22': 300 }, 420),
  policy('S-hold-node', 'Hold to expiry, skip a negative node in the path (F1)', 'S-hold', 250, { '2026-10-22': 250 }, -50),
] };

describe('PaperSpecComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaperSpecComponent] }).compileComponents();
  });

  function render(input: Partial<{ card: PaperBacktestScorecard | null; error: boolean }>) {
    const fixture = TestBed.createComponent(PaperSpecComponent);
    for (const [key, value] of Object.entries(input)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  function rows(fixture: ReturnType<typeof render>) {
    return Array.from(fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>)
      .map(row => Array.from(row.children).map(cell => cell.textContent?.replace(/\s+/g, ' ').trim()));
  }

  it('pairs each filter with its own control and the controls with the bot', () => {
    const fixture = render({ card });
    expect(rows(fixture)).toEqual([
      ['Bot (live rules)', '3', '−$120', '−$40', '67%', '—', '−$120'],
      ['Live exits, skip a negative node in the path (F1)', '3', '+$40', '+$13', '67%', '+$160 vs bot', '+$40'],
      ['Hold-exit control: hold to expiry (same rules as H1)', '3', '+$300', '+$100', '67%', '+$420 vs bot', '+$300'],
      ['Hold to expiry, skip a negative node in the path (F1)', '3', '+$250', '+$83', '67%', '−$50 vs Hold-exit control', '+$250'],
    ]);
    expect(fixture.nativeElement.querySelector('.test-banner').textContent).toContain('Session 1 of 20 to the first read');
  });

  it('says when it starts before the first session', () => {
    const banner = render({ card: { ...card, sessions: [], policies: card.policies.map(p => ({ ...p, versus_reference: null })) } })
      .nativeElement.querySelector('.test-banner').textContent.replace(/\s+/g, ' ');
    expect(banner).toContain('Strategy spec v1: entry filters vs their controls');
    expect(banner).toContain('Starts Thu Oct 22');
  });

  it('says when the spec is unavailable', () => {
    expect(render({ error: true }).nativeElement.textContent).toContain('Strategy spec unavailable.');
  });
});
