import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PivotLevel {
  id: number;
  price: number;
  index: string;
  date: string;
}

export interface PivotLevelCreate {
  price: number;
  index?: string;
  date?: string;
}

@Injectable({ providedIn: 'root' })
export class PivotTrackerService {
  private readonly baseUrl = `${environment.apiUrl}/pivots`;
  private readonly latestSubject = new BehaviorSubject<PivotLevel | null>(null);

  readonly latest$ = this.latestSubject.asObservable();

  constructor(private http: HttpClient) {}

  loadLatest(index = 'SPX'): Observable<PivotLevel> {
    const params = new HttpParams().set('index', index);
    return this.http
      .get<PivotLevel>(`${this.baseUrl}/latest`, { params })
      .pipe(tap(pivot => this.latestSubject.next(pivot)));
  }

  getHistory(limit = 7, index = 'SPX'): Observable<PivotLevel[]> {
    const params = new HttpParams()
      .set('limit', limit.toString())
      .set('index', index);

    return this.http.get<PivotLevel[]>(`${this.baseUrl}/history`, { params });
  }

  recordPivot(pivot: PivotLevelCreate): Observable<PivotLevel> {
    return this.http
      .post<PivotLevel>(this.baseUrl, pivot)
      .pipe(tap(created => this.latestSubject.next(created)));
  }

  setLatest(pivot: PivotLevel | null): void {
    this.latestSubject.next(pivot);
  }
}


/** A manually recorded pivot older than this many calendar days should be reviewed. */
export const PIVOT_STALE_DAYS = 7;

/** Whole calendar days since a YYYY-MM-DD pivot date, or null when the date is invalid. */
export function pivotAgeDays(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const recorded = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(recorded.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.max(0, Math.round((start.getTime() - recorded.getTime()) / 86_400_000));
}
