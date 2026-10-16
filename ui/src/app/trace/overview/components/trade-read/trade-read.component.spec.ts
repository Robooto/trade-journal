import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { TraceHistogramRow, TraceResearchStatusResponse } from '../../trace.models';
import type { Spx0DteDecisionJournalResponse } from '../decision-journal/decision-journal.models';
import { TradeReadComponent } from './trade-read.component';

const TS = '2026-10-16T10:20:05-07:00';

function decision(overrides: Partial<Spx0DteDecisionJournalResponse>): Spx0DteDecisionJournalResponse {
  return {
    schema_version: 'spx-0dte-decision.v1', protocol_id: 'spx-0dte-decision-journal-v1', date: '2026-10-16', ts: TS,
    capture_id: 'c1', prior_capture_id: 'c0', decision_status: 'ready', decision: 'take', trade_type: 'bull_put_credit',
    quality_score: 80, grade: 'B', score_components: {}, hard_gates: { positive_gamma: true, one_directional_hiro_thesis: true },
    reason_codes: [], frozen_structure: { type: 'local_support', level: 7652, distance_points_at_freeze: 8.2, distance_band: 'mid_5_10' },
    execution_ready: false, paper_trade_status: 'not_open',
    paper_trade: { spread_width_points: 10, profit_target_fraction_of_initial_credit: 0.5, forced_exit_time: '13:00' },
    selection: 'exact', protocol: { id: 'spx-0dte-decision-journal-v1', status: 'preregistered', frozen_on: '2026-08-30', prospective_start_date: '2026-08-31' },
    study: { id: 'spx-0dte-decision-journal', status: 'preregistered', mode: 'prospective_decision_journal', order_submission_enabled: false, ai_decisioning: false },
    warnings: [], ...overrides,
  } as Spx0DteDecisionJournalResponse;
}

function node(strike: number, overrides: Partial<TraceHistogramRow> = {}): TraceHistogramRow {
  return { ts: TS, capture_id: 'c1', timestamp: TS, gamma_sign: 'negative', center_strike: strike, state: 'STABLE',
    cluster_share: 0.3, ...overrides } as TraceHistogramRow;
}

const research = {
  schema_version: 'trace-study-registry.v1', as_of: '2026-10-16', evidence_version: 'w', study_count: 1, scoring_enabled_count: 0,
  studies: [{ id: 'structure-distance-short-strike', label: 'Distance', status: 'preregistered', scoring_enabled: false,
    evidence_tables: [{ scope: 'cumulative', week_end: '2026-10-16', id: 'primary_h6', title: 'H6',
      columns: ['Distance', 'N', 'Days', 'Raw rate', 'Adjusted lift'], rows: [['mid_5_10', '289', '98', '72%', '-3%'], ['near_0_3', '200', '85', '57%', '-22%']] }] }],
} as unknown as TraceResearchStatusResponse;

describe('TradeReadComponent', () => {
  let api: { decisionJournal: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { decisionJournal: vi.fn(() => of(decision({}))) };
    await TestBed.configureTestingModule({ imports: [TradeReadComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(TradeReadComponent);
    const all = { date: '2026-10-16', captureTs: TS, captureId: 'c1', spot: 7660, nodes: [], researchStatus: research, ...inputs };
    for (const [key, value] of Object.entries(all)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('reads a take with band history, the likely strike and time left', () => {
    const text = render().textContent ?? '';
    expect(api.decisionJournal).toHaveBeenCalledWith('2026-10-16', TS);
    expect(text).toContain('Bot takes a bull put');
    expect(text).toContain('8.2 pts · 5–10 band');
    expect(text).toContain('72% of strikes in this band held 60 minutes (289 past signals)');
    expect(text).toContain('7645 put');  // floor((7652 - 5) / 5) * 5
    expect(text).toContain('None');
    expect(text).toContain('2h 40m');
  });

  it('explains a pass blocked by the gamma gate and flags an eligible negative node in the path', () => {
    api.decisionJournal.mockReturnValue(of(decision({ decision: 'pass', hard_gates: { positive_gamma: false, one_directional_hiro_thesis: true },
      frozen_structure: { type: 'local_support', level: 7652, distance_points_at_freeze: 2.1, distance_band: 'fragile_0_3' } })));
    const element = render({ nodes: [node(7650), node(7655, { state: 'FADED' }), node(7648, { cluster_share: 0.01 }), node(7640)] });
    const text = element.textContent ?? '';
    expect(text).toContain('Bot passes on a bull put setup');
    expect(text).toContain('Blocked because gamma pocket is not positive');
    expect(text).toContain('57% of strikes in this band held');  // fragile_0_3 maps to the study's near_0_3 band.
    expect(text).toContain('Yes · 7,650');  // 7655 is faded, 7648 is too small, 7640 is beyond the 7645 strike.
    expect(element.querySelector('[data-tone="warn"]')).not.toBeNull();
  });

  it('bear calls look upward and unavailable decisions show no stale facts', () => {
    api.decisionJournal.mockReturnValue(of(decision({ trade_type: 'bear_call_credit',
      frozen_structure: { type: 'local_resistance', level: 7671, distance_points_at_freeze: 11, distance_band: 'far_10_20' } })));
    const text = render({ nodes: [node(7670)] }).textContent ?? '';
    expect(text).toContain('7680 call');
    expect(text).toContain('Yes · 7,670');
    api.decisionJournal.mockReturnValue(throwError(() => new Error('down')));
    const failed = render().textContent ?? '';
    expect(failed).toContain('decision is unavailable');
    expect(failed).not.toContain('Likely short strike');
  });
});
