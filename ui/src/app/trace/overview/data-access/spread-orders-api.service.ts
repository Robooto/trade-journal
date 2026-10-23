import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

export type SpreadSide = 'put' | 'call';

export interface SpreadOrderConfig { live_enabled: boolean; account_number: string | null; width: number; max_quantity: number; tick: number; }
export interface SpreadLegQuote { bid: number | null; ask: number | null; delta: number | null; }
export interface SpreadQuote {
  side: SpreadSide; expiration: string; short_strike: number; long_strike: number; width: number;
  short_symbol: string; long_symbol: string; short: SpreadLegQuote; long: SpreadLegQuote;
  natural: number | null; mid: number | null; suggested_price: number | null; quoted_at: string;
}
export interface SpreadPreview { account_number: string; payload: Record<string, unknown>; buying_power_change: number | null; fees: number | null; warnings: string[]; }
export interface SpreadOrderEvent { at: string; kind: string; [key: string]: unknown; }
export interface SpreadOrder {
  id: number; session_date: string; account_number: string; side: SpreadSide; short_strike: number; long_strike: number;
  width: number; quantity: number; short_symbol: string; long_symbol: string; limit_price: number; tasty_order_id: string | null;
  status: string; working: boolean; fill_credit: number | null; events: SpreadOrderEvent[]; created_at: string; updated_at: string;
}

/** Manual SPXW credit spreads through Trade Journal's brokerage boundary (/v1/spread-orders). */
@Injectable({ providedIn: 'root' })
export class SpreadOrdersApiService {
  private readonly base = `${environment.apiUrl}/spread-orders`;

  constructor(private readonly http: HttpClient) {}

  config(): Observable<SpreadOrderConfig> { return this.http.get<SpreadOrderConfig>(`${this.base}/config`); }

  quote(side: SpreadSide, shortStrike: number): Observable<SpreadQuote> {
    return this.http.post<SpreadQuote>(`${this.base}/quote`, { side, short_strike: shortStrike });
  }

  preview(side: SpreadSide, shortStrike: number, price: number): Observable<SpreadPreview> {
    return this.http.post<SpreadPreview>(`${this.base}/preview`, { side, short_strike: shortStrike, price });
  }

  submit(side: SpreadSide, shortStrike: number, price: number): Observable<SpreadOrder> {
    return this.http.post<SpreadOrder>(this.base, { side, short_strike: shortStrike, price, quantity: 1, confirmed: true });
  }

  today(): Observable<{ rows: SpreadOrder[] }> { return this.http.get<{ rows: SpreadOrder[] }>(this.base); }

  refresh(id: number): Observable<SpreadOrder> { return this.http.get<SpreadOrder>(`${this.base}/${id}`); }

  reprice(id: number, price: number): Observable<SpreadOrder> {
    return this.http.put<SpreadOrder>(`${this.base}/${id}/price`, { price, confirmed: true });
  }

  cancel(id: number): Observable<SpreadOrder> { return this.http.delete<SpreadOrder>(`${this.base}/${id}`); }
}
