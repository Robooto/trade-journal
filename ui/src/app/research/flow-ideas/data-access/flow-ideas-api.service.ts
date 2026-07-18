import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  FlowCandidatesResponse,
  FlowDatesResponse,
  FlowIdeasServerFilters,
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
}
