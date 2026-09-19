import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperLedgerComponent, PaperLedgerResponse } from './paper-ledger.component';

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
  const api = { paperTrades: vi.fn(() => of(RESPONSE)) };
  beforeEach(async () => {
    api.paperTrades.mockReset().mockReturnValue(of(RESPONSE));
    await TestBed.configureTestingModule({ imports: [PaperLedgerComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
    fixture = TestBed.createComponent(PaperLedgerComponent);
    fixture.componentRef.setInput('fromDate', '2026-09-21'); fixture.componentRef.setInput('toDate', '2026-09-21');
    fixture.detectChanges();
  });
  it('renders all four stored symbols and buy/sell labels without treating a condor as a vertical', () => {
    const text = fixture.nativeElement.textContent;
    for (const symbol of ['SPXW 985P', 'SPXW 990P', 'SPXW 1025C', 'SPXW 1030C']) expect(text).toContain(symbol);
    expect(text).toContain('BUY 1'); expect(text).toContain('SELL 1'); expect(text).toContain('$380.00');
    expect(text).toContain('Not persisted');
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ policy_id: 'credit-risk-to-close.v2' }));
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
});
