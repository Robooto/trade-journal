import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperNowComponent } from './paper-now.component';

describe('PaperNowComponent', () => {
  const response = {
    status: 'available', total: 1, cohorts: [], sessions: ['2026-09-21'], rows: [{
      evaluation_id: 'condor-1', strategy_id: 'spx-structure-iron-condor.v1',
      trade_type: 'iron_condor', width_points: 5, onset_ts: '2026-09-21T08:00:00-07:00',
      entry_credit_dollars: 120, status: 'open', reason: 'awaiting_exit',
      legs: [{ side: 'sell', quantity: 1, option_type: 'put', strike: 990, symbol: 'SPXW 990P' }],
    }],
  };
  const api = { paperTrades: vi.fn(() => of(response)) };

  beforeEach(async () => {
    api.paperTrades.mockReset().mockReturnValue(of(response));
    await TestBed.configureTestingModule({ imports: [PaperNowComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  it('shows strategies and expandable positions from the latest session only', () => {
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-21');
    fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-21', '2026-09-21', expect.objectContaining({ status: 'open', policy_id: 'credit-risk-to-close.v2' }));
    expect(fixture.nativeElement.textContent).toContain('Directional verticals');
    expect(fixture.nativeElement.textContent).toContain('Structure iron condor');
    expect(fixture.nativeElement.textContent).toContain('SPXW 990P');
    expect(fixture.nativeElement.textContent).toContain('Modeled positions, not broker holdings');
  });

  it('distinguishes unavailable evidence from no open positions', () => {
    api.paperTrades.mockReturnValue(throwError(() => new Error('offline')));
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-21');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Position evidence is unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('No positions are marked open');
  });
});
