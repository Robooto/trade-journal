import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TraceApiService } from './trace-api.service';

describe('TraceApiService', () => {
  let api: TraceApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    api = TestBed.inject(TraceApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('passes ledger filters through the read-only research proxy', () => {
    api.paperTrades('2026-09-14', '2026-09-18', { search: 'SPXW 260918P07625000', width_points: '5', offset: '0', limit: '50' }).subscribe();
    http.expectOne(request => request.url === '/research-api/api/trace/paper-trades' && request.method === 'GET'
      && request.params.get('search') === 'SPXW 260918P07625000' && request.params.get('from_date') === '2026-09-14'
      && request.params.get('width_points') === '5').flush({});
  });

  it('uses the same-origin research proxy for session discovery and dashboard sources', () => {
    api.sessions().subscribe();
    http.expectOne('/research-api/api/trace/sessions').flush({});

    const date = '2026-07-24';
    const sources: Array<[string, () => void]> = [
      ['summary', () => api.summary(date).subscribe()],
      ['timeseries', () => api.timeseries(date).subscribe()],
      ['histogram-map', () => api.histogram(date).subscribe()],
      ['gamma-context', () => api.gammaContext(date).subscribe()],
      ['realized-volatility', () => api.realizedVolatility(date).subscribe()],
    ];
    for (const [path, request] of sources) {
      request();
      http.expectOne(`/research-api/api/trace/${date}/${path}`).flush({});
    }
  });

  it('encodes timestamp parameters for detail contracts', () => {
    const date = '2026-07-24';
    const ts = '2026-07-24T13:00:05-07:00';

    api.gammaProfile(date, ts, 70).subscribe();
    http.expectOne(request =>
      request.url === `/research-api/api/trace/${date}/gamma-profile` &&
      request.params.get('ts') === ts &&
      request.params.get('window_points') === '70',
    ).flush({});

    api.snapshot(date, ts).subscribe();
    http.expectOne(request =>
      request.url === `/research-api/api/trace/${date}/snapshot` &&
      request.params.get('ts') === ts,
    ).flush({});

    api.intradayContext(date, ts, 8).subscribe();
    http.expectOne(request =>
      request.url === `/research-api/api/trace/${date}/intraday-context` &&
      request.params.get('ts') === ts &&
      request.params.get('window_rows') === '8',
    ).flush({});

    api.decisionJournal(date, ts).subscribe();
    http.expectOne(request =>
      request.url === `/research-api/api/trace/${date}/0dte-decision-journal` &&
      request.params.get('ts') === ts,
    ).flush({});

    api.human0DteDecision(date, 'capture-1').subscribe();
    http.expectOne(request =>
      request.url === '/v1/0dte-decisions' &&
      request.params.get('session_date') === date &&
      request.params.get('capture_id') === 'capture-1',
    ).flush({});
  });
});
