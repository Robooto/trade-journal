import { catalogForTest } from '../../data-access/paper-catalog.fixture';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperLedgerComponent } from './paper-ledger.component';
import type { PaperLedgerResponse } from '../../data-access/paper.models';

const RESPONSE = { status: 'available', total: 1, sessions: ['2026-09-21'], cohorts: [], rows: [{
  evaluation_id: 'synthetic', onset_ts: '2026-09-21T08:00:00-07:00', trade_type: 'iron_condor', width_points: 5,
  strategy_id: 'spx-structure-iron-condor.v1', date: '2026-09-21', protocol_sha256: 'synthetic',
  timing_policy: 'regular-close.v2', exit_ts: '2026-09-21T08:10:00-07:00', structures: {}, frozen_structure: null,
  status: 'closed', entry_status: 'recorded', reason: 'half_credit_target', gross_pnl_dollars: 60,
  entry_credit_dollars: 120, exit_debit_dollars: 60, max_risk_dollars: 380, path: [],
  legs: [
    { side: 'buy', symbol: 'SPXW 985P', option_type: 'put', strike: 985 },
    { side: 'sell', symbol: 'SPXW 990P', option_type: 'put', strike: 990 },
    { side: 'sell', symbol: 'SPXW 1025C', option_type: 'call', strike: 1025 },
    { side: 'buy', symbol: 'SPXW 1030C', option_type: 'call', strike: 1030 },
  ].map(leg => ({ ...leg, expiration: '2026-09-21', quantity: 1, entry_quote: null, exit_quote: null })),
}] } as PaperLedgerResponse;

describe('PaperLedgerComponent', () => {
  let fixture: ComponentFixture<PaperLedgerComponent>;
  const api = { paperCatalog: vi.fn((date: string) => of(catalogForTest(date))), paperTrades: vi.fn(() => of(RESPONSE)) };
  beforeEach(async () => {
    api.paperTrades.mockReset().mockReturnValue(of(RESPONSE));
    await TestBed.configureTestingModule({ imports: [PaperLedgerComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(PaperLedgerComponent);
    fixture.componentRef.setInput('fromDate', '2026-09-21'); fixture.componentRef.setInput('toDate', '2026-09-21');
    fixture.detectChanges();
  });
  it('defaults to the forward trial only from its prospective start', () => {
    fixture.componentRef.setInput('toDate', '2026-10-05'); fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenLastCalledWith('2026-09-21', '2026-10-05', expect.objectContaining({ policy_id: 'paper-distance-one-position.v1' }));
    expect(fixture.componentInstance.policies.some(p => p.id === 'credit-risk-to-close.v4')).toBe(true);
  });
  it('renders all four stored symbols and buy/sell labels without treating a condor as a vertical', () => {
    const text = fixture.nativeElement.textContent;
    for (const symbol of ['SPXW 985P', 'SPXW 990P', 'SPXW 1025C', 'SPXW 1030C']) expect(text).toContain(symbol);
    expect(text).toContain('BUY 1'); expect(text).toContain('SELL 1'); expect(text).toContain('$380.00');
    expect(text).toContain('Not persisted');
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ policy_id: 'credit-risk-to-close.v3' }));
  });
  it('resets paging on filter changes and preserves full contract search text', () => {
    const c = fixture.componentInstance;
    c.offset = 50; c.search = 'SPXW 990P'; c.strategy = 'spx-structure-iron-condor.v1'; c.load(true);
    expect(c.offset).toBe(0);
    expect(api.paperTrades).toHaveBeenLastCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ search: 'SPXW 990P', strategy_id: c.strategy }));
  });
  it('clears stale evidence on request failure', () => {
    api.paperTrades.mockReturnValue(throwError(() => new Error('offline')));
    fixture.componentInstance.load(); fixture.detectChanges();
    expect(fixture.componentInstance.response()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No results have been substituted');
  });
  it('selects the distance shadow and identifies excluded P/L as baseline evidence', () => {
    api.paperTrades.mockReturnValue(of({ ...RESPONSE, rows: [{ ...RESPONSE.rows[0],
      status: 'skipped', reason: 'fragile_structure_distance', gross_pnl_dollars: null,
      excluded_baseline_outcome: { status: 'closed', reason: 'two_times_entry_credit_stop', gross_pnl_dollars: -160 },
    }] }));
    const c = fixture.componentInstance;
    c.policy = 'structure-distance-shadow.v1'; c.load(true); fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenLastCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ policy_id: 'structure-distance-shadow.v1', active_only: 'true' }));
    expect(fixture.nativeElement.textContent).toContain("Excluded opportunity's baseline: closed");
    expect(fixture.nativeElement.textContent).toContain('-$160.00');
    expect(fixture.nativeElement.querySelector('details.trade summary').textContent).toContain('Unavailable gross');
  });
  it('shows only the trial and its current controls', () => {
    fixture.componentRef.setInput('toDate', '2026-10-05'); fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.policies.map(p => p.id).sort()).toEqual(['credit-risk-to-close.v4', 'paper-distance-one-position.v1', 'structure-distance-shadow.v1'].sort());
    expect(fixture.nativeElement.textContent).not.toContain('Include archived setups');
    expect(fixture.nativeElement.textContent).not.toContain('Structure iron condor');
  });
});
