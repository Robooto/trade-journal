import { catalogForTest } from '../../data-access/paper-catalog.fixture';
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
  const api = { paperCatalog: vi.fn((date: string) => of(catalogForTest(date))), paperTrades: vi.fn(() => of(response)) };

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
    expect(fixture.nativeElement.textContent).toContain('focused setup begins 2026-09-21');
  });
});

describe('PaperNowComponent performance and distance shadow', () => {
  it('shows loss-size metrics and excludes pre-start trades from the shadow request', async () => {
    const baseline = { closed: 31, open: 0, skipped: 8, unevaluable: 0, closed_sessions: 4,
      gross_pnl_dollars: -495, cost_scenario_pnl_dollars: -885.6,
      gross_expectancy_dollars: -15.97, average_win_dollars: 60, average_loss_dollars: -201.67,
      worst_session_gross_pnl_dollars: -900, gross_win_rate: 22 / 31 };
    const result = { status: 'available', rows: [], total: 0, cohorts: [], sessions: [],
      strategy_summaries: [{ strategy_id: 'spx-directional-vertical.v1', label: 'Directional verticals', summary: baseline }] };
    const api = { paperCatalog: vi.fn((date: string) => of(catalogForTest(date))), paperTrades: vi.fn(() => of(result)) };
    await TestBed.configureTestingModule({ imports: [PaperNowComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-25'); fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Gross expectancy / close');
    expect(text).toContain('-$15.97');
    expect(text).toContain('-$201.67');
    expect(text).toContain('-$900.00');
    expect(text).toContain('Awaiting the 2026-09-28 prospective start');
    expect(api.paperTrades).toHaveBeenCalledTimes(2);
    fixture.componentRef.setInput('date', '2026-09-28'); fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-28', '2026-09-28', expect.objectContaining({ policy_id: 'structure-distance-shadow.v1', limit: '1' }));
    expect(fixture.nativeElement.textContent).toContain('No eligible shadow evidence recorded yet');
  });
});

describe('Pipeline-owned paper configuration', () => {
  it('uses changed catalog IDs and dates without a frontend policy update', async () => {
    const original = catalogForTest('2026-09-28');
    const catalog = { ...original, active: { ...original.active!, policy_id: 'fixture-policy.v99', start_date: '2026-09-27' },
      distance_shadow: { ...original.distance_shadow, start_date: '2026-10-01' } };
    const api = { paperCatalog: vi.fn(() => of(catalog)), paperTrades: vi.fn(() => of({ status: 'no_evidence', rows: [], total: 0, cohorts: [], sessions: [] })) };
    await TestBed.configureTestingModule({ imports: [PaperNowComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-28'); fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-09-27', '2026-09-28', expect.objectContaining({ policy_id: 'fixture-policy.v99' }));
    expect(api.paperTrades).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('Awaiting the 2026-10-01 prospective start');
  });

  it('does not guess a policy when the catalog is unavailable', async () => {
    const api = { paperCatalog: vi.fn(() => throwError(() => new Error('offline'))), paperTrades: vi.fn() };
    await TestBed.configureTestingModule({ imports: [PaperNowComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-09-28'); fixture.detectChanges();
    expect(api.paperTrades).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Paper configuration unavailable');
  });
});

describe('Forward paper trial', () => {
  it('requests only future trial evidence and distinguishes completed paths from entry coverage', async () => {
    const summary = { closed: 2, open: 0, unevaluable: 1, skipped: 3, wins: 1, losses: 1,
      gross_pnl_dollars: -50, cost_scenario_pnl_dollars: -75.2,
      cost_scenario_expectancy_dollars: -37.6, average_win_dollars: 50, average_loss_dollars: -100,
      gross_win_rate: .5, empirical_break_even_win_rate: 112.6/150,
      completed_path_coverage: 2/3, completed_path_denominator: 3 };
    const evidence = { status: 'available', rows: [], total: 0, cohorts: [], sessions: [],
      forward_experiment: { start_date: '2026-10-05', required_sessions: 20, required_trial_closes: 100,
        complete_eligible_sessions: 0, eligible_trial_closes: 0, trial: summary, control: summary,
        mean_session_net_scenario: null, mean_session_difference: null, mean_session_net_interval_95: null,
        skip_reasons: {position_occupied_or_same_capture_exit: 3}, missing_distance_retained: 0, daily: [] } };
    const api = { paperCatalog: vi.fn((date: string) => of(catalogForTest(date))), paperTrades: vi.fn(() => of(evidence)),
      paperQuotePilot: vi.fn(() => of({status:'no_evidence', recorded_minutes:0, expected_minutes:10, missing_minutes: Array(10).fill('missing'),
        valid_observations:0, unavailable_observations:0, repeated_timestamp_observations:0, sample_states:{}, authentication_blocked:false})) };
    await TestBed.configureTestingModule({imports:[PaperNowComponent], providers:[{provide:TraceApiService,useValue:api}]}).compileComponents();
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date','2026-10-02'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Scheduled for 2026-10-05');
    expect(api.paperTrades.mock.calls.some(call => (call as unknown as [string,string,{policy_id:string}])[2]?.policy_id === 'paper-distance-one-position.v1')).toBe(false);
    fixture.componentRef.setInput('date','2026-10-05'); fixture.detectChanges();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-10-05','2026-10-05',expect.objectContaining({policy_id:'paper-distance-one-position.v1',limit:'1'}));
    expect(api.paperQuotePilot).toHaveBeenCalledWith('2026-10-05');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('66.7%'); expect(text).toContain('75.1%'); expect(text).toContain('-$37.60');
    expect(text).toContain('0/20 complete eligible sessions');
    expect(text).toContain('Complete-session mean after assumed costs: Not available');
  });
});
