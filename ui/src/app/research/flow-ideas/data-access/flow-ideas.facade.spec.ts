import { Observable, Subject, of } from 'rxjs';

import {
  FlowCandidatesResponse,
  FlowDatesResponse,
  FlowIdeasServerFilters,
} from '../flow-ideas.models';
import { FlowIdeasApiService } from './flow-ideas-api.service';
import { FlowIdeasFacade } from './flow-ideas.facade';

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

const candidateFixture: FlowCandidatesResponse = {
  schema_version: 'flowpatrol-candidates.v1',
  trading_date: '2026-07-09',
  status: 'partial',
  total: 2,
  limit: 200,
  offset: 0,
  rows: [
    {
      trading_date: '2026-07-09',
      symbol: 'AAPL',
      research_priority: 84.5,
      active_watch: true,
      watch_day: 2,
      appearance_streak: 2,
      change_event: 'strengthened',
      reason_codes: ['delta_upper_extreme'],
      reason_text: 'delta 95th percentile',
      spread_ids: [],
      asset_type: 'unclassified',
      is_index_etf: false,
      in_unusual: true,
      equityhub_url: 'https://example.test/aapl',
      brokerage_context: null,
    },
    {
      trading_date: '2026-07-09',
      symbol: 'SPX',
      research_priority: 61,
      active_watch: false,
      watch_day: 1,
      appearance_streak: 1,
      change_event: 'new',
      reason_codes: ['large_premium'],
      reason_text: 'large premium',
      spread_ids: [],
      asset_type: 'broad_index_etf',
      is_index_etf: true,
      in_unusual: false,
      equityhub_url: 'https://example.test/spx',
      brokerage_context: null,
    },
  ],
  brokerage_enrichment: {
    schema_version: 'research-symbol-context.v1',
    status: 'not_requested',
    requested_symbol_count: 0,
    matched_symbol_count: 0,
    warnings: [],
  },
};

class FlowIdeasApiStub {
  readonly candidateCalls: FlowIdeasServerFilters[] = [];
  readonly streams: Subject<FlowCandidatesResponse>[] = [];

  dates(): Observable<FlowDatesResponse> {
    return of(datesFixture);
  }

  candidates(filters: FlowIdeasServerFilters): Observable<FlowCandidatesResponse> {
    this.candidateCalls.push(filters);
    const stream = this.streams.shift();
    if (!stream) {
      throw new Error('Expected a prepared candidate stream.');
    }
    return stream;
  }
}

describe('FlowIdeasFacade', () => {
  it('cancels stale candidate requests when server filters change', () => {
    const api = new FlowIdeasApiStub();
    const first = new Subject<FlowCandidatesResponse>();
    const second = new Subject<FlowCandidatesResponse>();
    api.streams.push(first, second);

    const facade = new FlowIdeasFacade(api as unknown as FlowIdeasApiService);
    facade.setServerFilters({ tradingDate: '2026-07-09' });
    facade.setServerFilters({ event: 'new' });

    expect(api.candidateCalls).toEqual([
      {
        tradingDate: '2026-07-09',
        symbol: '',
        event: '',
        activeOnly: true,
      },
      {
        tradingDate: '2026-07-09',
        symbol: '',
        event: 'new',
        activeOnly: true,
      },
    ]);

    first.next(candidateFixture);
    expect(facade.candidateResponse()).toBeNull();

    second.next(candidateFixture);
    expect(facade.candidateResponse()).toEqual(candidateFixture);
    facade.ngOnDestroy();
  });

  it('uses backend broad-index classification for the local display filter', () => {
    const api = new FlowIdeasApiStub();
    const response = new Subject<FlowCandidatesResponse>();
    api.streams.push(response);

    const facade = new FlowIdeasFacade(api as unknown as FlowIdeasApiService);
    facade.setServerFilters({ tradingDate: '2026-07-09' });
    response.next(candidateFixture);

    expect(facade.metrics()).toEqual({
      active: 2,
      persistent: 1,
      unusual: 1,
      changed: 1,
    });

    facade.setDisplayFilters({ includeIndexEtfs: false });

    expect(facade.visibleCandidates().map(row => row.symbol)).toEqual(['AAPL']);
    expect(facade.metrics()).toEqual({
      active: 1,
      persistent: 1,
      unusual: 1,
      changed: 1,
    });
    facade.ngOnDestroy();
  });
});
