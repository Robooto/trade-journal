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
