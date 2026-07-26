import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  TraceGammaContextResponse,
  TraceGammaProfileResponse,
  TraceHistogramResponse,
  TraceIntradayContextResponse,
  TraceRealizedVolatilityResponse,
  TraceSessionsResponse,
  TraceSnapshotResponse,
  TraceSummaryResponse,
  TraceTimeseriesResponse,
} from '../trace.models';

@Injectable({ providedIn: 'root' })
export class TraceApiService {
  private readonly baseUrl = '/research-api/api/trace';

  constructor(private readonly http: HttpClient) {}

  sessions(): Observable<TraceSessionsResponse> {
    return this.http.get<TraceSessionsResponse>(`${this.baseUrl}/sessions`);
  }

  summary(date: string): Observable<TraceSummaryResponse> {
    return this.http.get<TraceSummaryResponse>(`${this.sessionUrl(date)}/summary`);
  }

  timeseries(date: string): Observable<TraceTimeseriesResponse> {
    return this.http.get<TraceTimeseriesResponse>(`${this.sessionUrl(date)}/timeseries`);
  }

  histogram(date: string): Observable<TraceHistogramResponse> {
    return this.http.get<TraceHistogramResponse>(`${this.sessionUrl(date)}/histogram-map`);
  }

  gammaContext(date: string): Observable<TraceGammaContextResponse> {
    return this.http.get<TraceGammaContextResponse>(`${this.sessionUrl(date)}/gamma-context`);
  }

  realizedVolatility(date: string): Observable<TraceRealizedVolatilityResponse> {
    return this.http.get<TraceRealizedVolatilityResponse>(
      `${this.sessionUrl(date)}/realized-volatility`,
    );
  }

  gammaProfile(
    date: string,
    ts: string,
    windowPoints = 60,
  ): Observable<TraceGammaProfileResponse> {
    const params = new HttpParams()
      .set('ts', ts)
      .set('window_points', String(windowPoints));
    return this.http.get<TraceGammaProfileResponse>(
      `${this.sessionUrl(date)}/gamma-profile`,
      { params },
    );
  }

  snapshot(date: string, ts: string): Observable<TraceSnapshotResponse> {
    const params = new HttpParams().set('ts', ts);
    return this.http.get<TraceSnapshotResponse>(
      `${this.sessionUrl(date)}/snapshot`,
      { params },
    );
  }

  intradayContext(
    date: string,
    ts: string | null = null,
    windowRows = 6,
  ): Observable<TraceIntradayContextResponse> {
    let params = new HttpParams().set('window_rows', String(windowRows));
    if (ts) params = params.set('ts', ts);
    return this.http.get<TraceIntradayContextResponse>(
      `${this.sessionUrl(date)}/intraday-context`,
      { params },
    );
  }

  private sessionUrl(date: string): string {
    return `${this.baseUrl}/${encodeURIComponent(date.trim())}`;
  }
}