import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperNowComponent } from './paper-now.component';

describe('PaperNowComponent', () => {
  const response = {
    status: 'available', total: 1, cohorts: [], sessions: ['2026-09-21'], rows: [{
      evaluation_id: 'condor-1', strategy_id: 'spx-structure-iron-condor.v1',
      trade_type: 'iron_condor', width_points: 10, onset_ts: '2026-09-21T08:00:00-07:00',
      entry_credit_dollars: 120, exit_debit_dollars: 60, gross_pnl_dollars: 60,
      entry_status: 'recorded', status: 'closed', reason: 'half_credit_target',
      legs: [{ side: 'sell', quantity: 1, option_type: 'put', strike: 990, symbol: 'SPXW 990P' }],
    }],
  };
  const api = { paperTrades: vi.fn(() => of(response)) };

  beforeEach(async () => {
    api.paperTrades.mockReset().mockReturnValue(of(response));
    await TestBed.configureTestingModule({ imports: [PaperNowComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  it('shows closed condors and their result in the latest session without opening the ledger', () => {
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-21');
    fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ policy_id: 'credit-risk-to-close.v3', limit: '200' }));
    expect(fixture.nativeElement.textContent).toContain('Directional verticals');
    expect(fixture.nativeElement.textContent).toContain('Structure iron condor');
    expect(fixture.nativeElement.textContent).toContain('SPXW 990P');
    expect(fixture.nativeElement.textContent).toContain('$60 gross');
    expect(fixture.nativeElement.textContent).toContain('1 entered');
    expect(fixture.nativeElement.textContent).toContain('Modeled trades from sampled quotes');
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ active_only: 'true', width_points: '10', limit: '1' }));
    expect(fixture.nativeElement.textContent).toContain('10–20 SPX points');
  });

  it('distinguishes unavailable evidence from no trades', () => {
    api.paperTrades.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-21');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Session trade evidence is unavailable');
  });
  it('does not substitute legacy trades before the focused cohort begins', () => {
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-18'); fixture.detectChanges();
    expect(api.paperTrades).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('focused setup begins September 21');
  });
});
