import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { WatchlistResearchApiService } from './watchlist-research-api.service';

describe('WatchlistResearchApiService', () => {
  let api: WatchlistResearchApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    api = TestBed.inject(WatchlistResearchApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the same-origin enriched brokerage watchlist contract', () => {
    api.load().subscribe(response =>
      expect(response.schema_version).toBe('broker-watchlist-research.v1'),
    );

    const request = http.expectOne('/v1/broker/watchlist-research');
    expect(request.request.method).toBe('GET');
    request.flush({
      schema_version: 'broker-watchlist-research.v1',
      generated_at: '2026-07-23T12:00:00Z',
      writes_enabled: true,
      watchlists: [],
      items: [],
      missing_symbols: [],
      source_status: [],
    });
  });
});
