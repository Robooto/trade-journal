import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { WatchlistResearchResponse } from './watchlist-research.models';

@Injectable({ providedIn: 'root' })
export class WatchlistResearchApiService {
  private readonly endpoint = '/v1/broker/watchlist-research';

  constructor(private readonly http: HttpClient) {}

  load(): Observable<WatchlistResearchResponse> {
    return this.http.get<WatchlistResearchResponse>(this.endpoint);
  }
}
