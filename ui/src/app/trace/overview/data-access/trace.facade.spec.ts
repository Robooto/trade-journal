import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subject, of, throwError } from 'rxjs';

import {
  TraceContractBase,
  TraceGammaContextResponse,
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
  rows: [],
};
const histogramFixture: TraceHistogramResponse = {
  ...contractBase('trace-histogram-map.v1'),
  rows: [],
};
const gammaFixture: TraceGammaContextResponse = {
  ...contractBase('trace-gamma-context.v1'),
  rows: [],
};
const volatilityFixture: TraceRealizedVolatilityResponse = {
  ...contractBase('trace-realized-volatility.v1'),
  contract_version: 'trace-realized-volatility.v1',
  as_of: '2026-07-24T13:00:05-07:00',
  methodology: {},
  history: {},
  thresholds: {},
  provenance: {},
  rows: [],
};

class TraceApiStub {
  readonly summaryStreams: Observable<TraceSummaryResponse>[] = [];
  readonly summaryDates: string[] = [];
  realizedVolatilityFails = false;

  sessions(): Observable<TraceSessionsResponse> { return of(sessionsFixture); }
  summary(selectedDate: string): Observable<TraceSummaryResponse> {
    this.summaryDates.push(selectedDate);
    return this.summaryStreams.shift() ?? of(summaryFixture);
  }
  timeseries(): Observable<TraceTimeseriesResponse> { return of(timeseriesFixture); }
  histogram(): Observable<TraceHistogramResponse> { return of(histogramFixture); }
  gammaContext(): Observable<TraceGammaContextResponse> { return of(gammaFixture); }
  realizedVolatility(): Observable<TraceRealizedVolatilityResponse> {
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
    const facade = new TraceFacade(api as unknown as TraceApiService);

    facade.loadSessions();

    expect(facade.selectedDate()).toBe(date);
    expect(facade.selectedSession()?.capture_count).toBe(41);
    expect(facade.bundle()?.summary?.spot_change).toBe(-3);
    expect(facade.availableResourceCount()).toBe(5);
    facade.ngOnDestroy();
  });

  it('cancels an older session bundle when the selected date changes', () => {
    const api = new TraceApiStub();
    const first = new Subject<TraceSummaryResponse>();
    const second = new Subject<TraceSummaryResponse>();
    api.summaryStreams.push(first, second);
    const facade = new TraceFacade(api as unknown as TraceApiService);

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

  it('retains successful sources when one optional source fails', () => {
    const api = new TraceApiStub();
    api.realizedVolatilityFails = true;
    const facade = new TraceFacade(api as unknown as TraceApiService);

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
});