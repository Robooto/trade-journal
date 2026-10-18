import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { StrikeLadderResponse, StrikeLadderRow } from '../../trace.models';
import { StrikeLadderComponent } from './strike-ladder.component';

const TS = '2026-10-19T10:30:05-07:00';
const EMPTY_NODES = { negative_between: [], positive_between: [], at_strike: [] };

function row(side: 'put' | 'call', strike: number, distance: number, overrides: Partial<StrikeLadderRow> = {}): StrikeLadderRow {
  return {
    side, short_strike: strike, distance_points: distance, history_distance_points: Math.round(distance),
    history: { captures: 900, sessions: 104, finished_beyond_rate: 0.06, touched_rate: 0.13,
      finished_beyond_interval: [0.03, 0.1], touched_interval: [0.08, 0.2] },
    prices: { long_strike: side === 'put' ? strike - 10 : strike + 10, credit: 85, mid_credit: 95, credit_to_risk: 0.093, short_abs_delta: 0.14 },
    nodes: EMPTY_NODES, bot_pick: false, pricing_read: 'market_richer', implied_minus_history: 0.08, ...overrides,
  };
}

function ladder(overrides: Partial<StrikeLadderResponse> = {}): StrikeLadderResponse {
  return {
    schema_version: 'trace-strike-ladder.v1', status: 'ok', date: '2026-10-19', capture_id: 'c1', ts: TS, spot: 7667,
    minutes_to_close: 149.9, time_bucket: '120-180', width_points: 10,
    grid: { capture_id: 'c1', captured_at: TS, spot: 7667 }, base_rate_sessions: 104,
    bot_pick: { decision: 'take', trade_type: 'bear_call_credit', side: 'call', short_strike: 7690 },
    rows: [
      row('call', 7690, 23, { bot_pick: true, nodes: { ...EMPTY_NODES,
        negative_between: [{ strike: 7670.1, sign: 'negative', state: 'STRENGTHENING', share: 0.19, share_change: 0.017 }] } }),
      row('call', 7675, 8, { pricing_read: 'market_cheaper' }),
      row('call', 7740, 73),
      row('put', 7650, 17, { pricing_read: 'in_line' }),
    ],
    warnings: [], notes: ['History uses only earlier sessions; intervals are by session, not capture.'], ...overrides,
  };
}

describe('StrikeLadderComponent', () => {
  let api: { strikeLadder: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { strikeLadder: vi.fn(() => of(ladder())) };
    await TestBed.configureTestingModule({ imports: [StrikeLadderComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(StrikeLadderComponent);
    for (const [key, value] of Object.entries({ date: '2026-10-19', captureTs: TS, ...inputs })) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows market price, history and path nodes per strike, nearest first, with the bot pick marked', () => {
    const { el } = render();
    expect(api.strikeLadder).toHaveBeenCalledWith('2026-10-19', TS);
    const callRows = Array.from(el.querySelectorAll('.side')[1].querySelectorAll('tbody tr'));
    expect(callRows.map(r => r.querySelector('th')?.textContent?.trim().slice(0, 4))).toEqual(['7675', '7690']);
    const pick = callRows[1];
    expect(pick.classList.contains('pick')).toBe(true);
    expect(pick.textContent).toContain('$85');
    expect(pick.textContent).toContain('14%');
    expect(pick.textContent).toContain('6%');
    expect(pick.textContent).toContain('−7670 ▲');
    expect(pick.textContent).toContain('Market richer');
    expect(callRows[0].getAttribute('data-read')).toBe('market_cheaper');
    expect(el.textContent).toContain('Bot take: bear call short 7690');
  });

  it('reveals far strikes on request', () => {
    const { fixture, el } = render();
    expect(el.textContent).not.toContain('7740');
    (el.querySelector('.toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('7740');
  });

  it('drops price columns and shows the warning before chain-grid prices exist', () => {
    api.strikeLadder.mockReturnValue(of(ladder({ status: 'prices_unavailable', grid: null,
      warnings: ['No chain-grid snapshot within 15 minutes of this capture; prices start October 19, 2026.'],
      rows: [row('put', 7650, 17, { prices: null, pricing_read: undefined })] })));
    const { el } = render();
    expect(el.textContent).toContain('prices start October 19');
    expect(el.textContent).not.toContain('Credit');
    expect(el.textContent).toContain('6%');
  });

  it('reports an unavailable ladder without breaking the page', () => {
    api.strikeLadder.mockReturnValue(throwError(() => new Error('down')));
    expect(render().el.textContent).toContain('Strike ladder unavailable');
  });

  it('shows whether HIRO confirms the 30-minute move, labelled unproven', () => {
    api.strikeLadder.mockReturnValue(of(ladder({ flow: { move_30m_points: 12, hiro_change_30m: 920e6, hiro_flat: false,
      hiro_confirms_move: true, side_against_move: 'put', evidence: 'H4: not yet established' } })));
    const { el } = render();
    expect(el.querySelector('.flow')?.textContent).toContain('SPX +12.0 pts / 30m · HIRO +920M / 30m · HIRO confirms the move · puts below sit against it');
    expect(el.querySelector('.flow')?.textContent).toContain('unproven (H4)');
  });
});
