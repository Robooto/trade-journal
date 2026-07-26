import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CharmApiService } from './charm-api.service';

describe('CharmApiService', () => {
  let api: CharmApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    api = TestBed.inject(CharmApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the same-origin research proxy for overview and selected surface', () => {
    api.overview('2026-07-24').subscribe();
    http.expectOne('/research-api/api/trace/2026-07-24/charm').flush({});

    api.surface('2026-07-24', '2026-07-24T13:00:00-07:00', 60).subscribe();
    const request = http.expectOne(req =>
      req.url === '/research-api/api/trace/2026-07-24/charm/surface' &&
      req.params.get('ts') === '2026-07-24T13:00:00-07:00' &&
      req.params.get('window_points') === '60',
    );
    request.flush({});
  });
});
