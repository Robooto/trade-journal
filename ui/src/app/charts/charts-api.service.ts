import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ChartResponse, ChartParams } from './charts.models';

@Injectable({ providedIn: 'root' })
export class ChartsApiService {
  private base = `${environment.apiUrl}/charts`;

  constructor(private http: HttpClient) {}

  getHistory(params: ChartParams): Observable<ChartResponse> {
    let httpParams = new HttpParams()
      .set('resolution', params.resolution);

    if (params.from_ts) {
      httpParams = httpParams.set('from_ts', params.from_ts.toString());
    }

    if (params.to_ts) {
      httpParams = httpParams.set('to_ts', params.to_ts.toString());
    }

    return this.http.get<ChartResponse>(
      `${this.base}/history/${params.symbol}`,
      { params: httpParams }
    );
  }
}