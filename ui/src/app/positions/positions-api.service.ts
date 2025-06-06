import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PositionsResponse } from './positions.models';

@Injectable({ providedIn: 'root' })
export class PositionsApiService {
  private base = `${environment.apiUrl}/trades`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<PositionsResponse> {
    return this.http.get<PositionsResponse>(this.base);
  }
}
