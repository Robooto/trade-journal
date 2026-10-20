import { TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { catalogForTest } from '../../data-access/paper-catalog.fixture';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { PaperLeg } from '../../data-access/paper.models';
import { PaperNowComponent } from './paper-now.component';

const summary = { closed: 1, open: 1, skipped: 1, unevaluable: 1, wins: 1, losses: 0,
  cost_scenario_pnl_dollars: 37.4, cost_scenario_expectancy_dollars: 37.4,
  average_win_dollars: 50, average_loss_dollars: null, gross_win_rate: 1,
  empirical_break_even_win_rate: null, completed_path_coverage: 1/3, completed_path_denominator: 3 };
function putLegs(shortStrike: number, longStrike: number): PaperLeg[] {
  return [{symbol:`short-${shortStrike}`,side:'sell',strike:shortStrike}, {symbol:`long-${longStrike}`,side:'buy',strike:longStrike}]
    .map(leg => ({...leg,option_type:'put',quantity:1,expiration:'2026-10-05',entry_quote:null,exit_quote:null}));
}
const row = { strategy_id:'spx-directional-vertical.v1', trade_type:'bull_put_credit', onset_ts:'2026-10-05T08:00:00-07:00',
  entry_credit_dollars:100, max_risk_dollars:900, legs:putLegs(7715,7705), gross_pnl_dollars:null };
const response = { status:'available', total:4, rows:[
  {...row, evaluation_id:'open', status:'open', reason:'awaiting_exit'},
  {...row, evaluation_id:'closed', legs:putLegs(7745,7735), status:'closed', reason:'profit_target', gross_pnl_dollars:50, exit_ts:'2026-10-05T08:10:00-07:00', cost_scenarios:[{net_scenario_dollars:37.4}]},
  {...row, evaluation_id:'skip', status:'skipped', reason:'position_occupied_or_same_capture_exit'},
  {...row, evaluation_id:'missing', status:'unevaluable', reason:'missing_path_quote'},
], strategy_summaries:[], forward_experiment:{trial:summary, control:summary, required_sessions:20, required_trial_closes:100,
  complete_eligible_sessions:0, eligible_trial_closes:0, mean_session_net_scenario:null, mean_session_net_interval_95:null, daily:[]} };

function apiFixture() {
  return { paperBacktestScorecard:vi.fn(() => NEVER), paperCatalog:vi.fn((date:string)=>of(catalogForTest(date))), paperTrades:vi.fn(()=>of(response)),
    decisionJournal:vi.fn(()=>of({decision_status:'ready',decision:'pass',trade_type:null,grade:'D',quality_score:25,reason_codes:['entry_score_or_gate_failed']})) };
}

describe('PaperNowComponent current strategy overview', () => {
  let api: ReturnType<typeof apiFixture>;
  beforeEach(async()=> {
    api=apiFixture();
    await TestBed.configureTestingModule({imports:[PaperNowComponent],providers:[{provide:TraceApiService,useValue:api}]}).compileComponents();
  });
  it('leads with the live bot and none of the older test variants',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent); fixture.componentRef.setInput('date','2026-10-05'); fixture.detectChanges();
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('SPX 0DTE credit spreads · live rules'); expect(text).toContain('Overlapping trades allowed');
    expect(text).not.toContain('Forward trial'); expect(text).not.toContain('distance-only control'); expect(text).not.toContain('Structure iron condor');
    const policies=api.paperTrades.mock.calls.map(call=>(call as unknown as [string,string,{policy_id:string}])[2]?.policy_id);
    expect(new Set(policies)).toEqual(new Set([catalogForTest('2026-10-05').active!.policy_id]));
    // The scorecard leads; the bot's rules and long-run record sit in a collapsed section.
    expect(fixture.nativeElement.querySelector('[aria-label="Current paper strategy"]').closest('details')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-paper-scorecard').compareDocumentPosition(
      fixture.nativeElement.querySelector('[aria-label="Current session trades"]')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('shows each closed trade under the hold-to-expiry rule too',()=> {
    api.paperBacktestScorecard.mockReturnValue(of({ schema_version:'paper-backtest-scorecard.v1', from_date:'2026-10-19', to_date:'2026-12-11',
      sessions:['2026-10-05'], reference_policy:'recorded-rules', cost_per_trade_dollars:12.6, order_submission_enabled:false,
      policies:[{ id:'H1-hold', label:'H1 hold to expiry', summary:{ closed:1, censored:0, net_dollars:87.4, net_per_trade:87.4, win_rate:1, worst_session:87.4, session_totals:{ '2026-10-05':87.4 } } as any, versus_reference:null,
        trades:[{ day:'2026-10-05', onset:row.onset_ts, status:'closed', reason:'expired', net:87.4 }] }] }) as any);
    const fixture=TestBed.createComponent(PaperNowComponent); fixture.componentRef.setInput('date','2026-10-05'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Closed paper trade"] .held-result').textContent).toContain('Held to expiry (H1): $87.40 after costs · settled at the close');
  });
  it('shows open trades, exits, skips and incomplete outcomes, then results since the cohort start',()=> {
    api.paperTrades.mockImplementation(((from: string) => of(from === '2026-10-05' ? response : {...response, strategy_summaries:[{strategy_id:'spx-directional-vertical.v1', summary}]})) as any);
    const fixture=TestBed.createComponent(PaperNowComponent); fixture.componentRef.setInput('date','2026-10-05'); fixture.detectChanges();
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('Open trades'); expect(text).toContain('Entry credit $100.00');
    expect(text).toContain('Profit target reached'); expect(text).toContain('$37.40 after assumed costs');
    expect(text).toContain('Position already open or just closed'); expect(text).toContain('Quote missing along the trade path');
    expect(text).toContain('33.3%'); expect(text).toContain('100.0% / Not available');
    expect(fixture.nativeElement.querySelector('[aria-label="Current session trades"]').closest('details')).toBeNull();
    expect(api.paperTrades).toHaveBeenCalledWith('2026-10-05','2026-10-05',expect.objectContaining({limit:'200'}));
  });
  it('shows selected capture signal and reasons directly',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');
    fixture.componentRef.setInput('captureTs','2026-10-05T08:00:00-07:00');fixture.detectChanges();
    expect(api.decisionJournal).toHaveBeenCalledWith('2026-10-05','2026-10-05T08:00:00-07:00');
    expect(fixture.nativeElement.textContent).toContain('Wait · entry conditions not met');
    expect(fixture.nativeElement.textContent).toContain('entry score or gate failed');
    expect(fixture.nativeElement.querySelector('[aria-label="Selected capture signal"]').closest('details')).toBeNull();
  });
  it('shows each open and closed trade’s recorded short and long strikes',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');fixture.detectChanges();
    const open=fixture.nativeElement.querySelector('[aria-label="Open paper trade"] [aria-label="Option strikes"]').textContent;
    const closed=fixture.nativeElement.querySelector('[aria-label="Closed paper trade"] [aria-label="Option strikes"]').textContent;
    expect(open).toContain('Short 7,715 put');expect(open).toContain('Long 7,705 put');
    expect(closed).toContain('Short 7,745 put');expect(closed).toContain('Long 7,735 put');
    expect(open).toContain('1 contract');expect(closed).toContain('1 contract');
    expect(closed).not.toContain('7,715');
  });
  it('identifies unavailable strikes in both trade sections',()=> {
    api.paperTrades.mockReturnValue(of({...response,rows:response.rows.map(trade=>({...trade,legs:[]}))}));
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');fixture.detectChanges();
    const strikes=fixture.nativeElement.querySelectorAll('[aria-label="Option strikes"]');
    expect(strikes.length).toBe(2);
    for (const element of strikes) expect(element.textContent).toContain('Unavailable');
  });
  it('keeps unavailable session state distinct from no open position',()=> {
    api.paperTrades.mockReturnValue(throwError(()=>new Error('offline')));
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Missing data is not a flat position');
    expect(fixture.nativeElement.textContent).not.toContain('No evaluable open trade');
  });
  it('shows collection exclusions independently of a ready signal and retained trade returns',()=> {
    api.paperTrades.mockReturnValue(of({...response, session_coverage:[{
      date:'2026-10-05', source_status:'incomplete', primary_status:'excluded',
      reasons:['capture_gap','outcome_unevaluable'], observed_cycles:32,
      first_capture_at:row.onset_ts,last_capture_at:row.onset_ts,largest_gap_seconds:3000,
      unknown_position_state:true,
    }]} as typeof response));
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');fixture.componentRef.setInput('captureTs',row.onset_ts);fixture.detectChanges();
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('Excluded from primary results');
    expect(text).toContain('Gap exceeds 12 minutes');
    expect(text).toContain('One or more trade paths cannot be evaluated');
    expect(text).toContain('$37.40 after assumed costs');
    expect(text).toContain('Wait · entry conditions not met');
  });
  it('keeps unpublished coverage explicit instead of inferring complete collection',()=> {
    const fixture=TestBed.createComponent(PaperNowComponent);fixture.componentRef.setInput('date','2026-10-05');fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Paper session coverage has not been published for this date');
  });
  it('reloads the scorecard on refresh but not for capture selection', () => {
    const fixture = TestBed.createComponent(PaperNowComponent);
    fixture.componentRef.setInput('date', '2026-10-13');
    fixture.detectChanges();
    expect(api.paperBacktestScorecard).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('captureTs', '2026-10-13T08:10:00-07:00');
    fixture.detectChanges();
    expect(api.paperBacktestScorecard).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('refreshAt', new Date());
    fixture.detectChanges();
    expect(api.paperBacktestScorecard).toHaveBeenCalledTimes(2);
  });
});
