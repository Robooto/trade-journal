import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { CharmDatesResponse, CharmOverview, CharmSurface } from './charm.models';

@Injectable({ providedIn: 'root' })
export class CharmApiService {
  private readonly baseUrl = '/research-api/api/trace';

  constructor(private readonly http: HttpClient) {}

  dates(): Observable<CharmDatesResponse> {
    return this.http.get<CharmDatesResponse>(`${this.baseUrl}/charm/dates`);
  }

  overview(date: string): Observable<CharmOverview> {
    return this.http.get<CharmOverview>(`${this.baseUrl}/${encodeURIComponent(date)}/charm`);
  }

  surface(date: string, ts: string | null, windowPoints: number): Observable<CharmSurface> {
    let params = new HttpParams().set('window_points', String(windowPoints));
    if (ts) params = params.set('ts', ts);
    return this.http.get<CharmSurface>(
      `${this.baseUrl}/${encodeURIComponent(date)}/charm/surface`, { params },
    );
  }
}
