import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable }   from 'rxjs';
import { environment }  from '../../environments/environment';
import {JournalEntry, JournalEvent, PaginatedJournalEntries, MarketData} from './journal.models';

@Injectable({ providedIn: 'root' })
export class JournalApiService {
  private base = `${environment.apiUrl}/entries`;

  constructor(private http: HttpClient) {}

  list(
    skip: number = 0,
    limit: number = 20,
    query: string = '',
    ticker: string = ''
  ): Observable<PaginatedJournalEntries> {
    let params = new HttpParams()
      .set('skip', skip)
      .set('limit', limit);
    if (query.trim()) {
      params = params.set('q', query.trim());
    }
    if (ticker.trim()) {
      params = params.set('ticker', ticker.trim().toUpperCase());
    }
    return this.http.get<PaginatedJournalEntries>(this.base, { params });
  }

  create(entry: Omit<JournalEntry,'id'>): Observable<JournalEntry> {
    return this.http.post<JournalEntry>(this.base, entry);
  }

  update(entry: JournalEntry): Observable<JournalEntry> {
    return this.http.put<JournalEntry>(
      `${this.base}/${entry.id}`, entry
    );
  }

  addEvent(entryId: string, ev: JournalEvent): Observable<JournalEntry> {
    return this.http.post<JournalEntry>(
      `${this.base}/${entryId}/events`, ev
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  getMarketData(
    equity: string[] = [],
    equityOption: string[] = [],
    future: string[] = [],
    futureOption: string[] = []
  ): Observable<MarketData[]> {
    const body = {
      equity,
      equity_option: equityOption,
      future,
      future_option: futureOption,
    };

    return this.http.post<MarketData[]>(
      `${environment.apiUrl}/trades/market-data`,
      body
    );
  }
}
