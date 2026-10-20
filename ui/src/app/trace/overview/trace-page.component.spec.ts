import { catalogForTest } from './data-access/paper-catalog.fixture';
import { By } from '@angular/platform-browser';
import { PaperWorkspaceComponent } from './components/paper-workspace/paper-workspace.component';
import { PaperReplayChartComponent } from './components/paper-replay-chart/paper-replay-chart.component';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { NEVER, of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';

import { SharedMaterialModule } from '../../shared/material.module';
import { CaptureHistoryComponent } from './components/capture-history/capture-history.component';
import { GammaProfileComponent } from './components/gamma-profile/gamma-profile.component';
import { MarketSnapshotComponent } from './components/market-snapshot/market-snapshot.component';
import { TraceApiService } from './data-access/trace-api.service';
import { SessionTrendsComponent } from './components/session-trends/session-trends.component';
import { SignedGexMapComponent } from './components/signed-gex-map/signed-gex-map.component';
import { TraceFacade } from './data-access/trace.facade';
import { TraceResearchStatusResponse, TraceStudyStatus } from './trace.models';
import { TracePageComponent, nextTraceAutoRefreshAt } from './trace-page.component';
import { PaperLedgerComponent } from './components/paper-ledger/paper-ledger.component';
import { PaperNowComponent } from './components/paper-now/paper-now.component';
import { ResearchSummaryComponent } from './components/research-summary/research-summary.component';
import { StrikeLadderComponent } from './components/strike-ladder/strike-ladder.component';
import { ChainGridHeatmapComponent } from './components/chain-grid-heatmap/chain-grid-heatmap.component';

class TraceApiStub {
  readonly paperBacktestScorecard = vi.fn(() => NEVER);
  readonly paperCatalog = vi.fn((date: string) => of(catalogForTest(date)));
  readonly paperTrades = vi.fn(() => of({ status: 'no_evidence', rows: [], total: 0, cohorts: [], sessions: [] }));
  readonly strikeLadder = vi.fn(() => NEVER);
  readonly chainGrid = vi.fn(() => NEVER);
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
  readonly researchStatus = signal<TraceResearchStatusResponse | null>(null);
  readonly researchStatusError = signal<string | null>(null);
  readonly paperCatalog = signal(null);
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
  readonly clearPaperReplay = vi.fn();
  readonly resetPaperReplay = vi.fn();
}

describe('TracePageComponent', () => {
  let fixture: ComponentFixture<TracePageComponent>;
  let facade: TraceFacadeStub;

  beforeEach(async () => {
    globalThis.localStorage.removeItem('trade-journal.trace.price-levels.v1');
    facade = new TraceFacadeStub();
    await TestBed.configureTestingModule({
      declarations: [TracePageComponent, PaperWorkspaceComponent, CaptureHistoryComponent, GammaProfileComponent, MarketSnapshotComponent, SessionTrendsComponent, SignedGexMapComponent],
      imports: [
        PaperReplayChartComponent,
        PaperLedgerComponent,
        PaperNowComponent,
        ResearchSummaryComponent,
        StrikeLadderComponent,
        ChainGridHeatmapComponent,
        CommonModule,
        FormsModule,
        SharedMaterialModule,
        NoopAnimationsModule,
      ],
      providers: [{ provide: TraceFacade, useValue: facade }, { provide: TraceApiService, useClass: TraceApiStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(TracePageComponent);
    fixture.detectChanges();
  });

  it('summarizes research by evidence tier with locked-test results and retired reasons', () => {
    const studies: readonly TraceStudyStatus[] = [
      { id: 'preregistered-robustness', label: 'GEX + slope robustness', status: 'collecting', scoring_enabled: false,
        evidence_tier: 'supported', summary: 'Price breaks negative-GEX nodes more often.',
        primary_tests: [
          { scope: 'cumulative', through: '2026-10-16', protocol_id: 'signed-gex-negative-breach-v1', role: 'primary',
            horizon: 'H30 (30 minutes)', validation_status: 'supported', coverage_ready: true,
            observations: 372, sessions: 100, effect: 9.9, interval_low: 2.7, interval_high: 16.8,
            unit: 'pp', expected_direction: 'positive' },
        ] },
      { id: 'dealer-gex-path', label: 'Dealer gamma path', status: 'preregistered', scoring_enabled: false,
        evidence_tier: 'replicating', summary: 'Needs confirmation from October 16.' },
      { id: 'paper-strategy-comparison', label: 'Paper comparison', status: 'collecting', scoring_enabled: false,
        evidence_tier: 'diagnostic', summary: 'Paper results.' },
    ];
    facade.researchStatus.set({schema_version: 'trace-study-registry.v1', as_of: '2026-10-16',
      evidence_version: 'week-end-2026-10-16', study_count: 3, scoring_enabled_count: 0, studies,
      headline: 'Distance and time left carry the signal.',
      latest_weekly_review: { week_start: '2026-10-12', week_end: '2026-10-16', run_status: 'complete' },
      retired_studies: [{ id: 'gamma-slope', label: 'Gamma slope', retired_on: '2026-10-16', reason: 'No movement difference.' }]});
    fixture.detectChanges();

    const summary = fixture.nativeElement.querySelector('app-research-summary');
    expect(summary.textContent).toContain('Distance and time left carry the signal.');
    expect(summary.textContent).toContain('reviewed 2026-10-16');
    const supported = summary.querySelector('[data-tier="supported"]');
    expect(supported.hasAttribute('open')).toBe(true);
    expect(supported.textContent).toContain('Latest locked test: +9.9 pts [+2.7, +16.8] · 372 observations · 100 days · supported');
    expect(summary.querySelector('[data-tier="replicating"]').textContent).toContain('Needs confirmation from October 16.');
    expect(summary.querySelector('[data-tier="diagnostic"]').hasAttribute('open')).toBe(false);
    expect(summary.querySelector('[data-tier="retired"]').textContent).toContain('Gamma slope');
    expect(summary.querySelector('[data-tier="retired"]').textContent).toContain('No movement difference.');
    expect(fixture.nativeElement.querySelector('.research-evidence-badge')).toBeNull();
  });

  it('keeps paper trading in its own tab and opens TRACE by default', () => {
    const traceTab = fixture.nativeElement.querySelector('#trace-workspace-tab') as HTMLButtonElement;
    const paperTab = fixture.nativeElement.querySelector('#paper-workspace-tab') as HTMLButtonElement;
    const tracePanel = fixture.nativeElement.querySelector('#trace-workspace-panel') as HTMLElement;
    const paperPanel = fixture.nativeElement.querySelector('#paper-workspace-panel') as HTMLElement;

    expect(traceTab.getAttribute('aria-selected')).toBe('true');
    expect(paperTab.getAttribute('aria-selected')).toBe('false');
    expect(tracePanel.hidden).toBe(false);
    expect(paperPanel.hidden).toBe(true);
    expect(tracePanel.querySelector('.price-level-panel')).not.toBeNull();
    expect(tracePanel.querySelector('.paper-scorecard-panel')).toBeNull();
    expect(paperPanel.querySelector('.paper-scorecard-panel')).toBeNull();

    paperTab.click();
    fixture.detectChanges();

    expect(traceTab.getAttribute('aria-selected')).toBe('false');
    expect(paperTab.getAttribute('aria-selected')).toBe('true');
    expect(tracePanel.hidden).toBe(true);
    expect(paperPanel.hidden).toBe(false);
  });

  it('preserves paper range and replay selection when switching workspace tabs', () => {
    const ts = '2026-09-22T08:10:00-07:00';
    facade.selectedDate.set('2026-09-22');
    facade.selectedCapture.set({ capture_id: 'later', ts });
    facade.paperReplayEntries.set({ entries: [
      { capture_id: 'entry', ts, strategy_id: 'spx-directional-vertical.v1' },
    ] });
    fixture.detectChanges();
    const workspace = fixture.debugElement.query(By.directive(PaperWorkspaceComponent)).componentInstance as PaperWorkspaceComponent;
    workspace.paperFromDate = '2026-09-21';
    workspace.paperToDate = '2026-09-22';
    workspace.selectReplayEntry('spx-directional-vertical.v1:entry');
    for (const tab of ['paper', 'trace', 'paper']) {
      (fixture.nativeElement.querySelector(`#${tab}-workspace-tab`) as HTMLButtonElement).click();
      fixture.detectChanges();
    }
    expect(fixture.debugElement.query(By.directive(PaperWorkspaceComponent)).componentInstance).toBe(workspace);
    expect(workspace.selectedReplayEntry).toBe('spx-directional-vertical.v1:entry');
    workspace.submitPaperRange();
    expect(facade.loadPaperScorecard).toHaveBeenCalledWith('2026-09-21', '2026-09-22');
    workspace.replaySelectedTrade();
    expect(facade.loadPaperReplay).toHaveBeenCalledWith('2026-09-22', 'later', 'entry', 'spx-directional-vertical.v1');
  });

  it('shows signal context directly and keeps supporting records collapsed', () => {
    facade.selectedDate.set('2026-09-04');
    facade.selectedCapture.set({ ts: '2026-09-04T08:10:00-07:00', capture_id: 'exit' });
    fixture.componentInstance.activeWorkspaceTab = 'paper';
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('#paper-workspace-panel') as HTMLElement;
    const ledger = panel.querySelector('.paper-ledger-disclosure') as HTMLDetailsElement;
    expect(panel.textContent).toContain('Paper trading now');
    expect(panel.querySelector('app-decision-journal')).toBeNull();
    expect(ledger.open).toBe(false);
    expect(panel.querySelector('app-paper-ledger')).toBeNull();
    expect(panel.querySelector('.paper-research-disclosure')).toBeNull();
    expect(panel.textContent).toContain('Entry signal');
    expect(panel.textContent).not.toContain('Your capture decision');
    ledger.open = true;
    ledger.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
    expect(panel.querySelector('app-paper-ledger')).not.toBeNull();
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
    expect(fixture.nativeElement.textContent).not.toContain('SPX 0DTE Decision Journal');
    const snapshot = fixture.nativeElement.querySelector('app-trace-market-snapshot').textContent;
    expect(snapshot).toContain('Snapshot');
    expect(snapshot).not.toContain('−1.28B');
    expect(snapshot).toContain('Medium');
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

  it('delegates session and timeline changes to the facade', () => {
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
    component.priceLevelLabel = 'Resistance';
    component.priceLevelColor = '#fbbf24';

    component.addPriceLevel();
    fixture.detectChanges();

    expect(component.priceLevels.levels()).toHaveLength(1);
    expect(component.priceLevels.levels()[0]).not.toHaveProperty('kind');
    expect(fixture.nativeElement.querySelector('.price-level-list').textContent).toContain('Resistance');
    expect(component.priceLevelLabel).toBe('Support');
    expect(globalThis.localStorage.getItem('trade-journal.trace.price-levels.v1')).toContain('7412.5');

    component.removePriceLevel(component.priceLevels.levels()[0].id);
    fixture.detectChanges();

    expect(component.priceLevels.levels()).toHaveLength(0);
  });

  it('edits an existing annotation through the shared form and cancels without saving', () => {
    const component = fixture.componentInstance;
    component.priceLevels.add(7400, 'Support');
    fixture.detectChanges();
    const id = component.priceLevels.levels()[0].id;
    fixture.nativeElement.querySelector('button[aria-label="Edit Support"]').click();
    fixture.detectChanges();
    expect(component.editingPriceLevelId).toBe(id);
    expect(component.priceLevelPrice).toBe(7400);
    expect(fixture.nativeElement.querySelector('.price-level-form button[type=submit]').textContent).toContain('Save');
    component.priceLevelPrice = 7425;
    component.addPriceLevel();
    expect(component.priceLevels.levels()).toHaveLength(1);
    expect(component.priceLevels.levels()[0].price).toBe(7425);
    expect(component.priceLevels.levels()[0].id).toBe(id);
    component.editPriceLevel(id);
    component.priceLevelPrice = 7500;
    component.cancelPriceLevelEdit();
    expect(component.priceLevels.levels()[0].price).toBe(7425);
    component.editPriceLevel(id);
    component.removePriceLevel(id);
    expect(component.editingPriceLevelId).toBeNull();
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
    component.priceLevelLabel = 'Resistance';

    component.addPriceLevel();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.price-level-list').textContent).toContain('3.0 pts · Touch');
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0]).toContain('Resistance 7,415 · 3.0 pts');

    facade.selectedCapture.set({ ...capture, spot: 7413 });
    fixture.detectChanges();
    expect(open).toHaveBeenCalledOnce();
  });

  it('puts price levels first, then ladder, node map, HIRO flow and snapshot', () => {
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
    facade.selectedDate.set('2026-07-24');
    (facade.bundle as any).set({ histogram: { rows: [] } });

    fixture.detectChanges();

    const order = Array.from(fixture.nativeElement.querySelectorAll(
      '.price-level-panel, app-trade-read, app-strike-ladder, app-signed-gex-map, app-trace-session-trends, app-chain-grid-heatmap, app-trace-market-snapshot, app-trace-gamma-profile, app-charm-widget, app-trace-capture-history',
    )).map((element: any) => element.classList.contains('price-level-panel') ? 'levels' : element.tagName.toLowerCase());
    // The October 19 order: levels, price per strike, node structure, flow, the day's chain grid, then the snapshot.
    expect(order).toEqual([
      'levels',
      'app-strike-ladder',
      'app-signed-gex-map',
      'app-trace-session-trends',
      'app-chain-grid-heatmap',
      'app-trace-market-snapshot',
      'app-trace-gamma-profile',
      'app-trace-capture-history',
    ]);
  });

});
