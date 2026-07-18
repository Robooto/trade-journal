import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  FlowCandidatesResponse,
  FlowContractsResponse,
  FlowDatesResponse,
  FlowIdeasServerFilters,
  FlowSymbolHistoryResponse,
} from '../flow-ideas.models';

@Injectable({ providedIn: 'root' })
export class FlowIdeasApiService {
  private readonly baseUrl = '/research-api/api/flowpatrol';

  constructor(private readonly http: HttpClient) {}

  dates(): Observable<FlowDatesResponse> {
    return this.http.get<FlowDatesResponse>(this.baseUrl + '/dates');
  }

  candidates(
    filters: FlowIdeasServerFilters,
    includeBrokerage = true,
  ): Observable<FlowCandidatesResponse> {
    let params = new HttpParams()
      .set('active_only', String(filters.activeOnly))
      .set('limit', '200')
      .set('offset', '0')
      .set('include_brokerage', String(includeBrokerage));

    if (filters.symbol.trim()) {
      params = params.set('symbol', filters.symbol.trim().toUpperCase());
    }
    if (filters.event.trim()) {
      params = params.set('event', filters.event.trim());
    }

    return this.http.get<FlowCandidatesResponse>(
      this.baseUrl +
        '/' +
        encodeURIComponent(filters.tradingDate) +
        '/candidates',
      { params },
    );
  }

  history(symbol: string): Observable<FlowSymbolHistoryResponse> {
    return this.http.get<FlowSymbolHistoryResponse>(
      this.baseUrl +
        '/symbols/' +
        encodeURIComponent(normalizeSymbol(symbol)) +
        '/history',
    );
  }

  contracts(
    tradingDate: string,
    symbol: string,
  ): Observable<FlowContractsResponse> {
    return this.http.get<FlowContractsResponse>(
      this.baseUrl +
        '/' +
        encodeURIComponent(tradingDate) +
        '/symbols/' +
        encodeURIComponent(normalizeSymbol(symbol)) +
        '/contracts',
    );
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}
