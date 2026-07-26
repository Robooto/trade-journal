import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';

import { CharmApiService } from '../../charm/charm-api.service';
import { CharmOverview } from '../../charm/charm.models';

import {
  TraceContractBase,
  TraceGammaContextResponse,
  TraceGammaProfileResponse,
  TraceHistogramResponse,
  TraceRealizedVolatilityResponse,
  TraceSessionsResponse,
  TraceSummaryResponse,
  TraceTimeseriesResponse,
} from '../trace.models';
import { TraceApiService } from './trace-api.service';
import { TraceFacade } from './trace.facade';

const date = '2026-07-24';

function contractBase<Schema extends string>(schema: Schema): TraceContractBase<Schema> {
  return {
    schema_version: schema,
    status: 'ready',
    date,
    generated_at: '2026-07-25T18:00:00Z',
    freshness: {
      generated_at: '2026-07-25T18:00:00Z',
      latest_capture_ts: '2026-07-24T13:00:05-07:00',
      session_relation: 'historical',
      latest_capture_age_seconds: null,
    },
    data_quality: {
      status: 'ready',
      row_count: 41,
      required_fields: ['ts', 'capture_id', 'spot'],
      missing_required_values: {},
      duplicate_capture_ids: 0,
      warnings: [],
    },
    warnings: [],
  };
}

const sessionsFixture: TraceSessionsResponse = {
  schema_version: 'trace-sessions.v1',
  status: 'ready',
  generated_at: '2026-07-25T18:00:00Z',
  latest_date: date,
  sessions: [{
    date,
    status: 'ready',
    capture_count: 41,
    unique_capture_count: 41,
    start_ts: '2026-07-24T06:20:05-07:00',
    end_ts: '2026-07-24T13:00:05-07:00',
    freshness: contractBase('fixture').freshness,
    data_quality: contractBase('fixture').data_quality,
    warnings: [],
  }],
  warnings: [],
};

const summaryFixture: TraceSummaryResponse = {
  ...contractBase('trace-summary.v1'),
  rows: 41,
  spot_change: -3,
};
const timeseriesFixture: TraceTimeseriesResponse = {
  ...contractBase('trace-timeseries.v1'),
  rows: [
    {
      ts: '2026-07-24T12:50:04-07:00',
      capture_id: 'capture-1',
      spot: 7410,
    } as TraceTimeseriesResponse['rows'][number],
    {
      ts: '2026-07-24T13:00:05-07:00',
      capture_id: 'capture-2',
      spot: 7412,
    } as TraceTimeseriesResponse['rows'][number],
  ],
};
const histogramFixture: TraceHistogramResponse = {
  ...contractBase('trace-histogram-map.v1'),
  rows: [],
};
const gammaFixture: TraceGammaContextResponse = {
  ...contractBase('trace-gamma-context.v1'),
  rows: [],
};
const gammaProfileFixture: TraceGammaProfileResponse = {
  ...contractBase('trace-gamma-profile.v1'),
  ts: '2026-07-24T13:00:05-07:00',
  capture_id: 'capture-2',
  spot: 7412,
  window_points: 60,
  cross_spot_slope: 47_042_808,
  source: { mode: 'fixture', timestamp: null, time: null },
  rows: [
    { spot: 7410, gamma: -120_000_000 },
    { spot: 7412, gamma: 25_000_000 },
    { spot: 7415, gamma: 140_000_000 },
  ],
};
const volatilityFixture: TraceRealizedVolatilityResponse = {
  ...contractBase('trace-realized-volatility.v1'),
  contract_version: 'trace-realized-volatility.v1',
  as_of: '2026-07-24T13:00:05-07:00',
  methodology: {},
  history: {},
  thresholds: {},
  provenance: {},
  rows: [{
    date,
    ts: '2026-07-24T13:00:05-07:00',
    as_of: '2026-07-24T13:00:05-07:00',
    capture_id: 'capture-2',
    realized_vol_bps: 6.4,
    return_observations: 6,
    lookback_returns: 6,
    classification_status: 'ready',
    realized_vol_regime: 'mid_realized',
    history_sufficient: true,
    current_window_sufficient: true,
  }],
};

const charmFixture: CharmOverview = {
  schema_version: 'trace-charm-overview.v1',
  date,
  status: 'experimental',
  interpretation: { scoring_enabled: false, directional_labels_enabled: false, visual_parity: 'ready', note: 'Research context only.' },
  quality: { total_rows: 1, usable_rows: 1, capture_count: 1, usable_capture_count: 1, boundary_rows: 0, missing_pair_rows: 0, snapshot_after_target_rows: 0, min_interval_minutes: 5, max_interval_minutes: 5, usable_percent: 100, status: 'ready' },
  distribution: { count: 1, positive_count: 1, negative_count: 0, sign_transitions: 0, median: 1, p05: 1, p95: 1, min: 1, max: 1 },
  latest: null,
  series: [{ ts: '2026-07-24T20:00:05Z', capture_id: 'capture-2', spot: 7412, surface_spot: 7410, charm_at_market: 327_000_000, nearest_flip: 7416.4, spot_minus_flip: -4.4, snapshot_ts: '2026-07-24T19:55:00Z', model_ts: '2026-07-24T19:55:00Z', next_model_ts: '2026-07-24T20:00:00Z', interval_minutes: 5, source_age_seconds: 305, close_window: true }],
};

class CharmApiStub {
  fails = false;
  overview(): Observable<CharmOverview> {
    return this.fails
      ? throwError(() => new HttpErrorResponse({ status: 404, error: { detail: 'Charm is unavailable.' } }))
      : of(charmFixture);
  }
}
class TraceApiStub {
  readonly summaryStreams: Observable<TraceSummaryResponse>[] = [];
  readonly summaryDates: string[] = [];
  readonly gammaProfileStreams: Observable<TraceGammaProfileResponse>[] = [];
  readonly gammaProfileRequests: { date: string; ts: string }[] = [];
  realizedVolatilityFails = false;

  sessions(): Observable<TraceSessionsResponse> { return of(sessionsFixture); }
  summary(selectedDate: string): Observable<TraceSummaryResponse> {
    this.summaryDates.push(selectedDate);
    return this.summaryStreams.shift() ?? of(summaryFixture);
  }
  timeseries(): Observable<TraceTimeseriesResponse> { return of(timeseriesFixture); }
  histogram(): Observable<TraceHistogramResponse> { return of(histogramFixture); }
  gammaContext(): Observable<TraceGammaContextResponse> { return of(gammaFixture); }
  gammaProfile(selectedDate: string, ts: string): Observable<TraceGammaProfileResponse> {
    this.gammaProfileRequests.push({ date: selectedDate, ts });
    return this.gammaProfileStreams.shift() ?? of({
      ...gammaProfileFixture,
      ts,
      capture_id: ts.includes('12:50') ? 'capture-1' : 'capture-2',
    });
  }  realizedVolatility(): Observable<TraceRealizedVolatilityResponse> {
    return this.realizedVolatilityFails
      ? throwError(() => new HttpErrorResponse({
          status: 404,
          error: { detail: 'Realized volatility is unavailable.' },
        }))
      : of(volatilityFixture);
  }
}

describe('TraceFacade', () => {
  it('selects the newest session and loads the independent source bundle', () => {
    const api = new TraceApiStub();
    const facade = new TraceFacade(api as unknown as TraceApiService, new CharmApiStub() as unknown as CharmApiService);

    facade.loadSessions();

    expect(facade.selectedDate()).toBe(date);
    expect(facade.selectedSession()?.capture_count).toBe(41);
    expect(facade.bundle()?.summary?.spot_change).toBe(-3);
    expect(facade.selectedCapture()?.capture_id).toBe('capture-2');
    expect(facade.selectedRealizedVolatility()?.realized_vol_bps).toBe(6.4);
    expect(facade.selectedCharm()?.charm_at_market).toBe(327_000_000);
    expect(facade.gammaProfile()?.capture_id).toBe('capture-2');
    expect(api.gammaProfileRequests).toEqual([{
      date,
      ts: '2026-07-24T13:00:05-07:00',
    }]);
    expect(facade.availableResourceCount()).toBe(5);
    facade.ngOnDestroy();
  });

  it('clamps timeline navigation and reloads gamma for the selected capture', () => {
    const api = new TraceApiStub();
    const facade = new TraceFacade(api as unknown as TraceApiService, new CharmApiStub() as unknown as CharmApiService);

    facade.selectDate(date);
    expect(facade.selectedCaptureIndex()).toBe(1);

    facade.stepCapture(-1);
    expect(facade.selectedCapture()?.capture_id).toBe('capture-1');
    expect(facade.gammaProfile()?.capture_id).toBe('capture-1');
    expect(api.gammaProfileRequests.at(-1)?.ts).toBe('2026-07-24T12:50:04-07:00');

    facade.selectCapture(99);
    expect(facade.selectedCaptureIndex()).toBe(1);
    facade.ngOnDestroy();
  });
  it('cancels an older session bundle when the selected date changes', () => {
    const api = new TraceApiStub();
    const first = new Subject<TraceSummaryResponse>();
    const second = new Subject<TraceSummaryResponse>();
    api.summaryStreams.push(first, second);
    const facade = new TraceFacade(api as unknown as TraceApiService, new CharmApiStub() as unknown as CharmApiService);

    facade.selectDate('2026-07-23');
    facade.selectDate(date);

    first.next(summaryFixture);
    first.complete();
    expect(facade.bundle()).toBeNull();

    second.next(summaryFixture);
    second.complete();
    expect(api.summaryDates).toEqual(['2026-07-23', date]);
    expect(facade.bundle()?.date).toBe(date);
    facade.ngOnDestroy();
  });

  it('cancels an older gamma profile request when the selected capture changes', () => {
    const api = new TraceApiStub();
    const older = new Subject<TraceGammaProfileResponse>();
    const newer = new Subject<TraceGammaProfileResponse>();
    api.gammaProfileStreams.push(older, newer);
    const facade = new TraceFacade(api as unknown as TraceApiService, new CharmApiStub() as unknown as CharmApiService);

    facade.selectDate(date);
    facade.stepCapture(-1);

    older.next(gammaProfileFixture);
    older.complete();
    expect(facade.gammaProfile()).toBeNull();

    newer.next({
      ...gammaProfileFixture,
      ts: '2026-07-24T12:50:04-07:00',
      capture_id: 'capture-1',
    });
    newer.complete();
    expect(facade.gammaProfile()?.capture_id).toBe('capture-1');
    facade.ngOnDestroy();
  });
  it('retains successful sources when one optional source fails', () => {
    const api = new TraceApiStub();
    api.realizedVolatilityFails = true;
    const facade = new TraceFacade(api as unknown as TraceApiService, new CharmApiStub() as unknown as CharmApiService);

    facade.selectDate(date);

    expect(facade.bundle()?.summary).toEqual(summaryFixture);
    expect(facade.bundle()?.realizedVolatility).toBeNull();
    expect(facade.bundle()?.errors.realizedVolatility).toBe(
      'Realized volatility is unavailable.',
    );
    expect(facade.availableResourceCount()).toBe(4);
    expect(facade.sessionError()).toBeNull();
    facade.ngOnDestroy();
  });
  it('keeps the core session available when optional Charm context fails', () => {
    const api = new TraceApiStub();
    const charmApi = new CharmApiStub();
    charmApi.fails = true;
    const facade = new TraceFacade(api as unknown as TraceApiService, charmApi as unknown as CharmApiService);

    facade.selectDate(date);

    expect(facade.bundle()?.summary).toEqual(summaryFixture);
    expect(facade.charmOverview()).toBeNull();
    expect(facade.charmError()).toBe('Charm is unavailable.');
    expect(facade.sessionError()).toBeNull();
    facade.ngOnDestroy();
  });
});
