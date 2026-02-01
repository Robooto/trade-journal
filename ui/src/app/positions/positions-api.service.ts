import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { BracketOrderRequest, BracketOrderResponse, PositionsResponse } from './positions.models';

@Injectable({ providedIn: 'root' })
export class PositionsApiService {
  private base = `${environment.apiUrl}/trades`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<PositionsResponse> {
    return this.http.get<PositionsResponse>(this.base);
  }

  submitBracketOrder(payload: BracketOrderRequest): Observable<BracketOrderResponse> {
    return this.http.post<BracketOrderResponse>(`${this.base}/bracket-orders`, payload);
  }
}
