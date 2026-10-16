import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import type { NegativePocketReview, NegativePocketTrade } from '../../data-access/generated/research-contracts';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperNegativePocketComponent } from './paper-negative-pocket.component';

function trade(overrides: Partial<NegativePocketTrade> = {}): NegativePocketTrade {
  return {
    entry_id: 'negative-pocket-shadow.v1:2026-10-16:2026-10-16T10-20-05-0700', date: '2026-10-16',
    signal_ts: '2026-10-16T10:20:05-07:00', trade_type: 'bear_call_credit', quality_score: 66,
    distance_band: 'near_3_5', short_strike: 7755, long_strike: 7765, entry_status: 'recorded', entry_reason: null,
    entry_credit_dollars: 200, entry_at: '2026-10-16T10:21:21-07:00', exit_at: '2026-10-16T10:33:21-07:00',
    status: 'closed', exit_reason: 'stop', net_pnl_dollars: -212.6, variant_net_pnl_dollars: { 'anchored-control': -272.6 },
    strike_gex: 'negative', path_gex_all_expiry: 'negative', gex_context_status: 'available', ...overrides,
  };
}

function review(overrides: Partial<NegativePocketReview> = {}): NegativePocketReview {
  return {
    schema_version: 'negative-pocket-review.v1', policy_id: 'negative-pocket-shadow.v1', start_date: '2026-10-16',
    from_date: '2026-10-16', to_date: '2026-10-16', as_of: '2026-10-16T20:30:00+00:00', status: 'collecting',
    candidate_statuses: { recorded: 2 }, unavailable_reasons: {}, sample_statuses: { received: 286, request_failed: 2, backoff: 2 },
    sessions_with_closes: 1,
    primary: { sessions: 1, shadow_closes: 2, baseline_closes: 3, difference_per_close: -101.33, interval_low: null, interval_high: null,
      interpretation: 'insufficient_evidence', interpretation_floor_dollars: -15, required_sessions: 20, required_closes: 100, required_weeks: 4 },
    policies: [
      { policy_id: 'control', cost_per_round_trip_dollars: 12.6, entries: 2, closed: 2, net_dollars: -105.2, net_per_close: -52.6,
        win_rate: 0.5, average_win: 107.4, average_loss: -212.6 },
      { policy_id: 'anchored-control', cost_per_round_trip_dollars: 12.6, entries: 2, closed: 2, net_dollars: -165.2, net_per_close: -82.6,
        win_rate: 0.5, average_win: 107.4, average_loss: -272.6 },
      { policy_id: 'control', cost_per_round_trip_dollars: 25, entries: 2, closed: 2, net_dollars: -130, net_per_close: -65,
        win_rate: 0.5, average_win: 95, average_loss: -225 },
    ],
    baseline_closed: 3, baseline_net_dollars: 317.2, baseline_net_per_close: 105.73,
    splits: [{ split: 'strike_gex=positive', with_closed: 0, with_net_per_close: null, without_closed: 2, without_net_per_close: -52.6 }],
    trades: [trade(), trade({ entry_id: 'b', signal_ts: '2026-10-16T08:50:05-07:00', trade_type: 'bull_put_credit', exit_reason: 'target',
      net_pnl_dollars: 107.4, strike_gex: null, path_gex_all_expiry: null, gex_context_status: 'unavailable' })],
    gex_context_review_date: '2026-10-15', automatic_promotion: false, order_submission_enabled: false, ...overrides,
  };
}

describe('PaperNegativePocketComponent', () => {
  let api: { paperNegativePocket: ReturnType<typeof vi.fn<(date: string) => Observable<NegativePocketReview>>> };
  beforeEach(async () => {
    api = { paperNegativePocket: vi.fn(() => of(review())) };
    await TestBed.configureTestingModule({
      imports: [PaperNegativePocketComponent], providers: [{ provide: TraceApiService, useValue: api }],
    }).compileComponents();
  });

  function render(date = '2026-10-16') {
    const fixture = TestBed.createComponent(PaperNegativePocketComponent);
    fixture.componentRef.setInput('date', date); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('summarizes the primary comparison and review progress in plain language', () => {
    const panel = render().querySelector('.negative-pocket')!;
    expect(api.paperNegativePocket).toHaveBeenCalledWith('2026-10-16');
    expect(panel.textContent).toContain('−$105.20');
    expect(panel.textContent).toContain('−$52.60 · +$105.73');
    expect(panel.textContent).toContain('range needs 2+ shared sessions');
    expect(panel.textContent).toContain('Not enough evidence yet');
    expect(panel.textContent).toContain('1/20 sessions · 2/100 trades');
    expect(panel.textContent).toContain('Results never change the live strategy');
  });

  it('lists signals newest first with dealer gamma and pending context', () => {
    const rows = Array.from(render().querySelectorAll('tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Bear call');
    expect(rows[0].textContent).toContain('stop');
    expect(rows[0].textContent).toContain('dealers short');
    expect(rows[0].getAttribute('data-outcome')).toBe('loss');
    expect(rows[1].textContent).toContain('after 13:20');
    expect(rows[1].getAttribute('data-outcome')).toBe('win');
  });

  it('shows stop variants and secondary splits only at the primary cost', () => {
    const details = render().querySelector('details')!;
    expect(details.textContent).toContain('Stop from entry debit: −$165.20 over 2 trades');
    expect(details.textContent).toContain('Dealers long 0DTE gamma at the short strike: 0 trades');
    expect(details.textContent).toContain('286 quote minutes received · 4 retry minutes');
    expect(details.textContent).not.toContain('−$130.00');
  });

  it('reports an unavailable review without stale numbers', () => {
    api.paperNegativePocket.mockReturnValue(throwError(() => new Error('offline')));
    const element = render();
    expect(element.textContent).toContain('Negative-gamma pocket test unavailable');
    expect(element.querySelector('table')).toBeNull();
  });
});

describe('PaperNegativePocketComponent formatting', () => {
  it('labels distance bands in points and credits without a sign', () => {
    const component = new PaperNegativePocketComponent({} as TraceApiService);
    expect(component.distance('near_3_5')).toBe('3–5 pts');
    expect(component.distance('fragile_0_3')).toBe('0–3 pts');
    expect(component.distance('wide_20_plus')).toBe('20+ pts');
    expect(component.distance(null)).toBe('—');
    expect(component.dollars(60)).toBe('$60.00');
  });
});
