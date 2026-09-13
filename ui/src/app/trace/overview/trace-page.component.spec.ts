import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { PaperEvidence } from './components/decision-journal/decision-journal.models';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';

import { SharedMaterialModule } from '../../shared/material.module';
import { CharmApiService } from '../charm/charm-api.service';
import { CharmWidgetComponent } from '../charm/charm-widget.component';
import { CaptureHistoryComponent } from './components/capture-history/capture-history.component';
import { GammaProfileComponent } from './components/gamma-profile/gamma-profile.component';
import { MarketSnapshotComponent } from './components/market-snapshot/market-snapshot.component';
import { DecisionJournalComponent } from './components/decision-journal/decision-journal.component';
import { TraceApiService } from './data-access/trace-api.service';
import { SessionTrendsComponent } from './components/session-trends/session-trends.component';
import { SignedGexMapComponent } from './components/signed-gex-map/signed-gex-map.component';
import { TraceFacade } from './data-access/trace.facade';
import { TracePageComponent, nextTraceAutoRefreshAt } from './trace-page.component';

class CharmApiStub {
  readonly surface = vi.fn(() => of({
    ts: '2026-07-24T13:00:05-07:00',
    spot: 7412,
    nearest_flip: 7410,
    robust_abs_p95: 100,
    source: { close_window: false },
    rows: [{ spot: 7400, charm_per_minute: -10 }, { spot: 7420, charm_per_minute: 10 }],
  }));
}
class TraceApiStub {
  readonly decisionJournal = vi.fn(() => of({
    schema_version: 'spx-0dte-decision.v1',
    protocol_id: 'spx-0dte-decision-journal-v1',
    date: '2026-07-24',
    ts: '2026-07-24T13:00:05-07:00',
    capture_id: 'capture-2',
    prior_capture_id: 'capture-1',
    decision_status: 'ineligible', decision: 'pass', trade_type: null, quality_score: 0, grade: 'D',
    score_components: {}, hard_gates: { inside_decision_window: false }, reason_codes: ['outside_decision_window'],
    frozen_structure: null,
    execution_ready: false, paper_trade_status: 'not_open',
    paper_trade: { spread_width_points: 5, profit_target_fraction_of_initial_credit: 0.5, forced_exit_time: '12:00 America/Los_Angeles' },
    selection: 'exact',
    protocol: { id: 'spx-0dte-decision-journal-v1', status: 'preregistered', frozen_on: '2026-08-30', prospective_start_date: '2026-08-31' },
    study: { id: 'spx-0dte-decision-journal', status: 'preregistered', mode: 'prospective_decision_journal', order_submission_enabled: false, ai_decisioning: false },
    warnings: [],
  }));
  readonly human0DteDecision = vi.fn(() => of({ schema_version: 'spx-0dte-human-decision-list.v1', rows: [] }));
  readonly createHuman0DteDecision = vi.fn();
}
class TraceFacadeStub {
  readonly sessions = signal([]);
  readonly sessionsLoading = signal(false);
  readonly sessionsError = signal<string | null>(null);
  readonly selectedDate = signal('');
  readonly selectedSession = signal(null);
  readonly sessionLoading = signal(false);
  readonly sessionError = signal<string | null>(null);
  readonly bundle = signal(null);
  readonly captureRows = signal<any[]>([]);
  readonly selectedCaptureIndex = signal(0);
  readonly selectedCapture = signal<any>(null);
  readonly selectedRealizedVolatility = signal<any>(null);
  readonly gammaProfile = signal<any>(null);
  readonly gammaProfileLoading = signal(false);
  readonly gammaProfileError = signal<string | null>(null);
  readonly charmOverview = signal<any>(null);
  readonly charmLoading = signal(false);
  readonly charmError = signal<string | null>(null);
  readonly paperScorecard = signal<any>(null);
  readonly paperScorecardLoading = signal(false);
  readonly paperScorecardError = signal<string | null>(null);
  readonly paperReplay = signal<any>(null);
  readonly paperReplayLoading = signal(false);
  readonly paperReplayError = signal<string | null>(null);
  readonly paperReplayEntries = signal<any>(null);
  readonly paperReplayEntriesLoading = signal(false);
  readonly paperReplayEntriesError = signal<string | null>(null);
  readonly resourceStatuses = signal([]);
  readonly availableResourceCount = signal(0);
  readonly loadSessions = vi.fn();
  readonly selectDate = vi.fn();
  readonly selectCapture = vi.fn();
  readonly stepCapture = vi.fn();
  readonly reload = vi.fn();
  readonly loadPaperScorecard = vi.fn();
  readonly loadPaperReplay = vi.fn();
  readonly loadPaperReplayEntries = vi.fn();
  readonly resetPaperReplay = vi.fn();
}

describe('TracePageComponent', () => {
  let fixture: ComponentFixture<TracePageComponent>;
  let facade: TraceFacadeStub;

  beforeEach(async () => {
    globalThis.localStorage.removeItem('trade-journal.trace.price-levels.v1');
    facade = new TraceFacadeStub();
    await TestBed.configureTestingModule({
      declarations: [TracePageComponent, CaptureHistoryComponent, GammaProfileComponent, MarketSnapshotComponent, DecisionJournalComponent, SessionTrendsComponent, SignedGexMapComponent, CharmWidgetComponent],
      imports: [
        CommonModule,
        FormsModule,
        SharedMaterialModule,
        NoopAnimationsModule,
      ],
      providers: [{ provide: TraceFacade, useValue: facade }, { provide: CharmApiService, useClass: CharmApiStub }, { provide: TraceApiService, useClass: TraceApiStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(TracePageComponent);
    fixture.detectChanges();
  });

  it('loads one operational dashboard without migration scaffolding', () => {
    expect(facade.loadSessions).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Charm pressure');
    expect(fixture.nativeElement.textContent).not.toContain('Source readiness');
    expect(fixture.nativeElement.textContent).not.toContain('Thin frontend boundary');
    expect(fixture.nativeElement.textContent).not.toContain('Migration foundation');
    expect(fixture.nativeElement.textContent).not.toContain('Legacy TRACE');
  });

  it('shows missing paper evidence without inventing a zero win rate', () => {
    facade.selectedDate.set('2026-09-04');
    facade.selectedCapture.set({ ts: '2026-09-04T08:00:00-07:00', capture_id: 'entry' });
    fixture.detectChanges();
    const journal = fixture.debugElement.query(By.directive(DecisionJournalComponent)).componentInstance as DecisionJournalComponent;
    const evidence: PaperEvidence = {
      schema_version: 'spx-paper-outcomes.v1', date: '2026-09-04', as_of: '2026-09-04T08:00:00-07:00',
      status: 'no_evidence', costs_status: 'untracked', net_win_rate: null, preferred_credit_dollars: 160,
      summary: { take_episodes: 1, recorded_entries: 0, closed_episodes: 0, open_episodes: 0,
        unevaluable_episodes: 1, gross_win_rate: null, gross_pnl_dollars: null, gross_expectancy_dollars: null },
      episodes: [],
    };
    journal.systemDecision.update(value => value ? { ...value, paper_evidence: evidence } : value);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.decision-journal__paper').textContent;
    expect(text).toContain('No paper quotes recorded');
    expect(text).toContain('Unavailable');
    expect(text).not.toContain('0%');
    expect(text).toContain('net results unavailable');
    journal.systemDecision.update(value => value ? { ...value, paper_evidence: { ...evidence, status: 'unavailable', summary: null } } : value);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('This is not zero performance');
  });

  it('renders gross outcomes and zero P/L explicitly without calling them net', () => {
    facade.selectedDate.set('2026-09-04');
    facade.selectedCapture.set({ ts: '2026-09-04T08:10:00-07:00', capture_id: 'exit' });
    fixture.detectChanges();
    const journal = fixture.debugElement.query(By.directive(DecisionJournalComponent)).componentInstance as DecisionJournalComponent;
    const evidence: PaperEvidence = {
      schema_version: 'spx-paper-outcomes.v1', date: '2026-09-04', as_of: '2026-09-04T08:10:00-07:00',
      status: 'available', costs_status: 'untracked', net_win_rate: null, preferred_credit_dollars: 160,
      summary: { take_episodes: 1, recorded_entries: 1, closed_episodes: 1, open_episodes: 0,
        unevaluable_episodes: 0, gross_win_rate: 0, gross_pnl_dollars: 0, gross_expectancy_dollars: 0 },
      episodes: [{ capture_id: 'entry', onset_ts: '2026-09-04T08:00:00-07:00', trade_type: 'bull_put_credit',
        status: 'closed', reason: 'hierarchy_changed', entry_credit_dollars: 160, credit_difference_dollars: 0,
        exit_debit_dollars: 160, gross_pnl_dollars: 0 }],
    };
    journal.systemDecision.update(value => value ? { ...value, paper_evidence: evidence } : value);
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.decision-journal__paper').textContent;
    expect(text).toContain('0%');
    expect(text).toContain('$0.00');
    expect(text).toContain('8:00 AM');
    expect(text).toContain('Gross win rate');
    expect(text).toContain('not a take/pass gate');
  });

  it('aligns automatic updates one minute after each ten-minute TRACE capture', () => {
    expect(nextTraceAutoRefreshAt(new Date('2026-07-24T12:00:30'))).toEqual(new Date('2026-07-24T12:02:00'));
    expect(nextTraceAutoRefreshAt(new Date('2026-07-24T12:02:00'))).toEqual(new Date('2026-07-24T12:12:00'));
    expect(nextTraceAutoRefreshAt(new Date('2026-07-24T12:08:45'))).toEqual(new Date('2026-07-24T12:12:00'));
  });

  it('automatically reloads at the next aligned update time', () => {
    fixture.destroy();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:30'));
    facade.loadSessions.mockClear();
    facade.reload.mockClear();

    fixture = TestBed.createComponent(TracePageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.nextAutoRefreshAt()).toEqual(new Date('2026-07-24T12:02:00'));
    expect(fixture.nativeElement.textContent).toContain('Automatic updates on');

    vi.advanceTimersByTime(89_999);
    expect(facade.reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(facade.reload).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.nextAutoRefreshAt()).toEqual(new Date('2026-07-24T12:12:00'));

    fixture.destroy();
    vi.useRealTimers();
  });

  it('defers a scheduled update while hidden and catches up when visible', () => {
    fixture.destroy();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T12:00:30'));
    const visibilityState = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    facade.reload.mockClear();

    fixture = TestBed.createComponent(TracePageComponent);
    fixture.detectChanges();
    vi.advanceTimersByTime(90_000);

    expect(facade.reload).not.toHaveBeenCalled();
    expect(fixture.componentInstance.nextAutoRefreshAt()).toBeNull();

    visibilityState.mockReturnValue('visible');
    fixture.componentInstance.handleVisibilityChange();

    expect(facade.reload).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.nextAutoRefreshAt()).toEqual(new Date('2026-07-24T12:12:00'));

    visibilityState.mockRestore();
    fixture.destroy();
    vi.useRealTimers();
  });

  it('selects only dates present in the TRACE session catalog', () => {
    (facade.sessions as any).set([
      { date: '2026-07-23', status: 'ready' },
      { date: '2026-07-24', status: 'ready' },
    ]);
    facade.selectedDate.set('2026-07-24');
    fixture.detectChanges();

    const selectedDate = fixture.componentInstance.selectedSessionDate();
    expect(fixture.componentInstance.selectedSessionDate()).toBe(selectedDate);
    expect(selectedDate?.getFullYear()).toBe(2026);
    expect(selectedDate?.getMonth()).toBe(6);
    expect(selectedDate?.getDate()).toBe(24);
    expect(fixture.nativeElement.querySelector('mat-datepicker-toggle')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.trace-control-panel select')).toBeNull();
    expect(fixture.componentInstance.sessionDateFilter(new Date(2026, 6, 24))).toBe(true);
    expect(fixture.componentInstance.sessionDateFilter(new Date(2026, 6, 22))).toBe(false);

    fixture.componentInstance.selectSessionDate(new Date(2026, 6, 23));
    expect(facade.selectDate).toHaveBeenCalledWith('2026-07-23');
  });

  it('renders the selected capture as a glanceable market snapshot', () => {
    const capture = {
      ts: '2026-07-24T13:00:05-07:00',
      capture_id: 'capture-2',
      spot: 7412,
      spx_hiro: -1_280_000_000,
      spx_hiro_rate_per_minute: 119_000_000,
      equities_hiro: -1_280_000_000,
      equities_hiro_rate_per_minute: -18_000_000,
      flow_relationship: 'divergent',
      flow_state: 'spx_up_equities_down',
      put_wall: 7300,
      hedge_wall: 7510,
      call_wall: 7600,
      global_shelf_center: 7404.8,
      shelf_direction: 'up',
      shelf_center_d: 3.5,
      local_gamma_setup: 'neg_with_above',
      pocket_sign: 'negative',
    };
    facade.captureRows.set([capture]);
    facade.selectedCapture.set(capture);
    facade.selectedRealizedVolatility.set({
      realized_vol_regime: 'mid_realized',
      realized_vol_bps: 6.4,
      return_observations: 6,
    });    (facade.bundle as any).set({
      histogram: { rows: [] },
      gammaContext: { rows: [] },
      realizedVolatility: {
        thresholds: { low_max_bps: 5.1, mid_max_bps: 8.3 },
        rows: [{
          capture_id: 'capture-2',
          as_of: capture.ts,
          realized_vol_regime: 'mid_realized',
          classification_status: 'ready',
          realized_vol_bps: 6.4,
          return_observations: 6,
          lookback_returns: 6,
        }],
      },
    });

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Session timeline');
    expect(fixture.nativeElement.textContent).toContain('SPX 0DTE Decision Journal');
    expect(fixture.nativeElement.textContent).toContain('Market snapshot');
    expect(fixture.nativeElement.textContent).toContain('−1.28B');
    expect(fixture.nativeElement.textContent).toContain('Medium movement');
  });

  it('moves through captures with unmodified left and right arrow keys', () => {
    facade.captureRows.set([{ capture_id: 'capture-1' }, { capture_id: 'capture-2' }]);

    const left = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(left);
    const right = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(right);

    expect(facade.stepCapture).toHaveBeenNthCalledWith(1, -1);
    expect(facade.stepCapture).toHaveBeenNthCalledWith(2, 1);
    expect(left.defaultPrevented).toBe(true);
    expect(right.defaultPrevented).toBe(true);
  });

  it('preserves arrow-key behavior inside controls and for modified shortcuts', () => {
    facade.captureRows.set([{ capture_id: 'capture-1' }]);
    const input = document.createElement('input');
    fixture.nativeElement.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }));
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(facade.stepCapture).not.toHaveBeenCalled();
  });

  it('delegates session, timeline, and Charm capture changes to the facade', () => {
    facade.captureRows.set([{ ts: 'first' }, { ts: 'selected' }]);
    (facade.sessions as any).set([{ date: '2026-07-24', status: 'ready' }]);
    fixture.componentInstance.selectSessionDate(new Date(2026, 6, 24));
    fixture.componentInstance.selectCapture('4');
    fixture.componentInstance.selectCaptureTimestamp('selected');

    expect(facade.selectDate).toHaveBeenCalledWith('2026-07-24');
    expect(facade.selectCapture).toHaveBeenNthCalledWith(1, 4);
    expect(facade.selectCapture).toHaveBeenNthCalledWith(2, 1);
  });

  it('adds and removes browser-persisted marked price levels', () => {
    const component = fixture.componentInstance;
    component.priceLevelPrice = 7412.5;
    component.priceLevelLabel = 'Invalidation';
    component.priceLevelColor = '#fbbf24';
    component.priceLevelKind = 'negative_gamma';

    component.addPriceLevel();
    fixture.detectChanges();

    expect(component.priceLevels.levels()).toHaveLength(1);
    expect(component.priceLevels.levels()[0].kind).toBe('negative_gamma');
    expect(fixture.nativeElement.textContent).toContain('Invalidation');
    expect(globalThis.localStorage.getItem('trade-journal.trace.price-levels.v1')).toContain('7412.5');

    component.removePriceLevel(component.priceLevels.levels()[0].id);
    fixture.detectChanges();

    expect(component.priceLevels.levels()).toHaveLength(0);
  });

  it('shows a contextual soft alert when the latest capture enters five points of a level', () => {
    const snackBar = TestBed.inject(MatSnackBar);
    const open = vi.spyOn(snackBar, 'open');
    const capture = { ts: '2026-07-24T13:00:05-07:00', capture_id: 'capture-2', spot: 7412 };
    facade.captureRows.set([capture]);
    facade.selectedCapture.set(capture);
    facade.selectedCaptureIndex.set(0);
    const component = fixture.componentInstance;
    component.priceLevelPrice = 7415;
    component.priceLevelLabel = 'Negative band';
    component.priceLevelKind = 'negative_gamma';

    component.addPriceLevel();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Elevated breach / acceleration risk');
    expect(fixture.nativeElement.textContent).toContain('3.0 pts');
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toContain('Negative band 7,415 · 3.0 pts');

    facade.selectedCapture.set({ ...capture, spot: 7413 });
    fixture.detectChanges();
    expect(open).toHaveBeenCalledOnce();
  });

  it('keeps charts in the same sequence as the legacy TRACE dashboard', () => {
    const capture = {
      ts: '2026-07-24T13:00:05-07:00',
      capture_id: 'capture-2',
      spot: 7412,
      spx_hiro: 1,
      equities_hiro: -1,
      put_wall: 7300,
      hedge_wall: 7410,
      call_wall: 7500,
      global_shelf_center: 7405,
    };
    facade.captureRows.set([capture]);
    facade.selectedCapture.set(capture);
    (facade.bundle as any).set({ histogram: { rows: [] } });

    fixture.detectChanges();

    const order = Array.from(fixture.nativeElement.querySelectorAll(
      'app-signed-gex-map, app-trace-session-trends, app-trace-gamma-profile, app-charm-widget, app-trace-capture-history',
    )).map((element: any) => element.tagName.toLowerCase());
    expect(order).toEqual([
      'app-signed-gex-map',
      'app-trace-session-trends',
      'app-trace-gamma-profile',
      'app-charm-widget',
      'app-trace-capture-history',
    ]);
  });

  it('renders replay segments with readable time and price ticks across gaps', () => {
    facade.paperReplay.set({
      schema_version: 'spx-paper-replay.v1', date: '2026-07-24', as_of: '2026-07-24T10:00:00-07:00',
      selected_capture_id: 'c3', entry_capture_id: 'c1',
      trade: { capture_id: 'c1', onset_ts: '2026-07-24T08:00:00-07:00', status: 'closed', reason: 'target', trade_type: 'bull_put_credit', timing_policy: 'noon.v1', frozen_structure: { type: 'support', level: 7390 }, short_strike: 7385, long_strike: 7380, entry_credit_dollars: 100, exit_debit_dollars: 50, gross_pnl_dollars: 50 },
      levels: [{ label: 'Frozen structure', price: 7390 }, { label: 'Short strike', price: 7385 }, { label: 'Long strike', price: 7380 }],
      path: [
        { ts: '2026-07-24T08:00:00-07:00', capture_id: 'c1', spot: 7400, gap_seconds: null, gap: false },
        { ts: '2026-07-24T08:10:00-07:00', capture_id: 'c2', spot: 7395, gap_seconds: 600, gap: false },
        { ts: '2026-07-24T09:00:00-07:00', capture_id: 'c3', spot: 7388, gap_seconds: 3000, gap: true },
      ], hierarchy_events: [{ ts: '2026-07-24T08:00:00-07:00', capture_id: 'c1', event: 'entry' }], gaps_explicit: true, warnings: [],
    });
    const component = fixture.componentInstance;
    expect(component.replaySegments()).toHaveLength(2);
    expect(component.replaySegments()[1]).toContain('98,');
    expect(component.replayX('c2')).toBeCloseTo(23, 0);
    expect(component.replayTimeTicks().map(tick => tick.label)).toHaveLength(3);
    expect(component.replayPriceTicks()).toEqual([7400, 7390, 7380]);
  });
});
