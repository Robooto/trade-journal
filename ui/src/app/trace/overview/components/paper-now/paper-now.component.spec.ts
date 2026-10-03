import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { catalogForTest } from '../../data-access/paper-catalog.fixture';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperNowComponent } from './paper-now.component';

const summary = { closed: 1, open: 1, skipped: 1, unevaluable: 1, wins: 1, losses: 0,
  cost_scenario_pnl_dollars: 37.4, cost_scenario_expectancy_dollars: 37.4,
  average_win_dollars: 50, average_loss_dollars: null, gross_win_rate: 1,
  empirical_break_even_win_rate: null, completed_path_coverage: 1/3, completed_path_denominator: 3 };
const row = { strategy_id:'spx-directional-vertical.v1', trade_type:'bull_put_credit', onset_ts:'2026-10-05T08:00:00-07:00',
  entry_credit_dollars:100, max_risk_dollars:900, legs:[], gross_pnl_dollars:null };
const response = { status:'available', total:4, rows:[
  {...row, evaluation_id:'open', status:'open', reason:'awaiting_exit'},
  {...row, evaluation_id:'closed', status:'closed', reason:'profit_target', gross_pnl_dollars:50, exit_ts:'2026-10-05T08:10:00-07:00', cost_scenarios:[{net_scenario_dollars:37.4}]},
  {...row, evaluation_id:'skip', status:'skipped', reason:'position_occupied_or_same_capture_exit'},
  {...row, evaluation_id:'missing', status:'unevaluable', reason:'missing_path_quote'},
], strategy_summaries:[], forward_experiment:{trial:summary, control:summary, required_sessions:20, required_trial_closes:100,
  complete_eligible_sessions:0, eligible_trial_closes:0, mean_session_net_scenario:null, mean_session_net_interval_95:null, daily:[]} };

function apiFixture() {
  return { paperCatalog:vi.fn((date:string)=>of(catalogForTest(date))), paperTrades:vi.fn(()=>of(response)),
    paperQuotePilot:vi.fn(()=>of({status:'no_evidence',recorded_minutes:0,expected_minutes:0,missing_minutes:[],valid_observations:0,unavailable_observations:0,sample_states:{}})),
    decisionJournal:vi.fn(()=>of({decision_status:'ready',decision:'pass',trade_type:null,grade:'D',quality_score:25,reason_codes:['entry_score_or_gate_failed']})) };
}

describe('PaperNowComponent current strategy overview', () => {
  let api: ReturnType<typeof apiFixture>;
  beforeEach(async()=> {
    api=apiFixture();
    await TestBed.configureTestingModule({imports:[PaperNowComponent],providers:[{provide:TraceApiService,useValue:api}]}).compileComponents();
  });
  it('puts the scheduled strategy first and removes retired strategy cards',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent); fixture.componentRef.setInput('date','2026-10-02'); fixture.detectChanges();
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('Scheduled for 2026-10-05'); expect(text).toContain('1 open position');
    expect(text).not.toContain('Structure iron condor'); expect(text).not.toContain('5 versus 10');
    expect(fixture.nativeElement.querySelector('[aria-label="Current paper strategy"]').closest('details')).toBeNull();
    expect(api.paperTrades.mock.calls.some(call=>(call as unknown as [string,string,{policy_id:string}])[2]?.policy_id==='paper-distance-one-position.v1')).toBe(false);
  });
  it('shows open trades, exits, skips and incomplete outcomes without research disclosures',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent); fixture.componentRef.setInput('date','2026-10-05'); fixture.detectChanges();
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('Open trades'); expect(text).toContain('Entry credit $100.00');
    expect(text).toContain('Profit target reached'); expect(text).toContain('$37.40 after assumed costs');
    expect(text).toContain('Position already open or just closed'); expect(text).toContain('Quote missing along the trade path');
    expect(text).toContain('33.3%'); expect(text).toContain('100.0% / Not available');
    expect(fixture.nativeElement.querySelector('[aria-label="Current session trades"]').closest('details')).toBeNull();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-10-05','2026-10-05',expect.objectContaining({policy_id:'paper-distance-one-position.v1',limit:'200'}));
  });
  it('shows selected capture signal and reasons directly',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');
    fixture.componentRef.setInput('captureTs','2026-10-05T08:00:00-07:00');fixture.detectChanges();
    expect(api.decisionJournal).toHaveBeenCalledWith('2026-10-05','2026-10-05T08:00:00-07:00');
    expect(fixture.nativeElement.textContent).toContain('Wait · entry conditions not met');
    expect(fixture.nativeElement.textContent).toContain('entry score or gate failed');
    expect(fixture.nativeElement.querySelector('[aria-label="Selected capture signal"]').closest('details')).toBeNull();
  });
  it('keeps unavailable session state distinct from no open position',()=> {
    api.paperTrades.mockReturnValue(throwError(()=>new Error('offline')));
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Missing data is not a flat position');
    expect(fixture.nativeElement.textContent).not.toContain('No evaluable open trade');
  });
});
