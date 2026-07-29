import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  WatchlistResearchResponse,
  WatchlistSymbolAddResponse,
} from './watchlist-research.models';

@Injectable({ providedIn: 'root' })
export class WatchlistResearchApiService {
  private readonly endpoint = '/v1/broker/watchlist-research';

  constructor(private readonly http: HttpClient) {}

  load(): Observable<WatchlistResearchResponse> {
    return this.http.get<WatchlistResearchResponse>(this.endpoint);
  }

  addSymbol(
    watchlistName: string,
    symbol: string,
  ): Observable<WatchlistSymbolAddResponse> {
    return this.http.post<WatchlistSymbolAddResponse>(
      '/v1/broker/watchlists/' +
        encodeURIComponent(watchlistName) +
        '/symbols',
      { symbol: symbol.trim().toUpperCase() },
    );
  }
}
