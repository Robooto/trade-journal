import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ChartResponse, ChartParams, RawVolatilityData, RawMarketData } from './charts.models';

@Injectable({ providedIn: 'root' })
export class ChartsApiService {
  private chartsBase = `${environment.apiUrl}/charts`;
  private tradesBase = `${environment.apiUrl}/trades`;

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
      `${this.chartsBase}/history/${params.symbol}`,
      { params: httpParams }
    );
  }

  getVolatilityData(symbol: string): Observable<RawVolatilityData[]> {
    const payload = [symbol.toUpperCase()];
    return this.http.post<RawVolatilityData[]>(
      `${this.tradesBase}/volatility-data`,
      payload
    );
  }

  getMarketData(symbol: string): Observable<RawMarketData[]> {
    const payload = {
      equity: [symbol.toUpperCase()],
      equity_option: [],
      future: [],
      future_option: []
    };

    return this.http.post<RawMarketData[]>(
      `${this.tradesBase}/market-data`,
      payload
    );
  }
}
