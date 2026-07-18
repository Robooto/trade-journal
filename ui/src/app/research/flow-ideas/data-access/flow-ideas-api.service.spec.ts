import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FlowCandidatesResponse, FlowDatesResponse } from '../flow-ideas.models';
import { FlowIdeasApiService } from './flow-ideas-api.service';

const datesFixture: FlowDatesResponse = {
  schema_version: 'flowpatrol-dates.v1',
  dates: [
    {
      trading_date: '2026-07-09',
      status: 'partial',
      candidate_count: 2,
      quality_issue_count: 1,
    },
  ],
};

const candidatesFixture: FlowCandidatesResponse = {
  schema_version: 'flowpatrol-candidates.v1',
  trading_date: '2026-07-09',
  status: 'partial',
  total: 2,
  limit: 200,
  offset: 0,
  rows: [],
  brokerage_enrichment: {
    schema_version: 'research-symbol-context.v1',
    status: 'not_requested',
    requested_symbol_count: 0,
    matched_symbol_count: 0,
    warnings: [],
  },
};

describe('FlowIdeasApiService', () => {
  let api: FlowIdeasApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    api = TestBed.inject(FlowIdeasApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the same-origin FlowPatrol dates contract', () => {
    api.dates().subscribe(response => expect(response).toEqual(datesFixture));

    const request = http.expectOne('/research-api/api/flowpatrol/dates');
    expect(request.request.method).toBe('GET');
    request.flush(datesFixture);
  });

  it('maps only server filters to the candidates request', () => {
    api
      .candidates({
        tradingDate: '2026-07-09',
        symbol: 'aapl',
        event: 'strengthened',
        activeOnly: false,
      })
      .subscribe(response => expect(response).toEqual(candidatesFixture));

    const request = http.expectOne(candidateRequest =>
      candidateRequest.url ===
        '/research-api/api/flowpatrol/2026-07-09/candidates',
    );

    expect(request.request.params.get('symbol')).toBe('AAPL');
    expect(request.request.params.get('event')).toBe('strengthened');
    expect(request.request.params.get('active_only')).toBe('false');
    expect(request.request.params.get('limit')).toBe('200');
    expect(request.request.params.get('include_brokerage')).toBe('true');
    request.flush(candidatesFixture);
  });


  it('uses typed ticker history and dated contract evidence routes', () => {
    api.history('aapl').subscribe(response => expect(response.symbol).toBe('AAPL'));
    api
      .contracts('2026-07-09', 'aapl')
      .subscribe(response => expect(response.symbol).toBe('AAPL'));

    const history = http.expectOne(
      '/research-api/api/flowpatrol/symbols/AAPL/history',
    );
    const contracts = http.expectOne(
      '/research-api/api/flowpatrol/2026-07-09/symbols/AAPL/contracts',
    );

    history.flush({
      schema_version: 'flowpatrol-symbol-history.v1',
      symbol: 'AAPL',
      rows: [],
    });
    contracts.flush({
      schema_version: 'flowpatrol-contracts.v1',
      trading_date: '2026-07-09',
      symbol: 'AAPL',
      status: 'ready',
      rows: [],
    });
  });

  it('uses multipart upload and explicit watchlist command routes', () => {
    const file = new File(['pdf'], 'flowpatrol_2026_07_13.pdf', {
      type: 'application/pdf',
    });
    api.uploadReport(file).subscribe();
    api.watchlists().subscribe();
    api.addWatchlistSymbol('Core Options', 'aapl').subscribe();

    const upload = http.expectOne('/research-api/api/flowpatrol/upload');
    expect(upload.request.method).toBe('POST');
    expect(upload.request.body.get('report')).toBeTruthy();
    upload.flush({ schema_version: 'flowpatrol-upload.v1', ok: true });

    const lists = http.expectOne('/research-api/api/flowpatrol/brokerage/watchlists');
    expect(lists.request.method).toBe('GET');
    lists.flush({
      schema_version: 'broker-watchlists.v1',
      flowpatrol_schema_version: 'flowpatrol-brokerage-watchlists.v1',
      writes_enabled: true,
      watchlists: [],
    });

    const add = http.expectOne(
      '/research-api/api/flowpatrol/brokerage/watchlists/Core%20Options/symbols',
    );
    expect(add.request.body).toEqual({ symbol: 'AAPL' });
    add.flush({
      schema_version: 'watchlist-symbol-write.v1',
      flowpatrol_schema_version: 'flowpatrol-brokerage-watchlist-write.v1',
      watchlist: { name: 'Core Options', symbols: ['AAPL'], symbol_count: 1 },
      symbol: 'AAPL',
      added: true,
    });
  });
});