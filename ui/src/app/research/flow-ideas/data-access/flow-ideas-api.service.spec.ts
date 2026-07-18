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
});
