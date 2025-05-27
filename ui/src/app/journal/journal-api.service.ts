import { Injectable } from '@angular/core';
import { HttpClient }   from '@angular/common/http';
import { Observable }   from 'rxjs';
import { environment }  from '../../environments/environment';
import { JournalEntry } from './journal-entry.model';

@Injectable({ providedIn: 'root' })
export class JournalApiService {
  private base = `${environment.apiUrl}/entries`;

  constructor(private http: HttpClient) {}

  list(): Observable<JournalEntry[]> {
    return this.http.get<JournalEntry[]>(this.base);
  }

  create(entry: Omit<JournalEntry,'id'>): Observable<JournalEntry> {
    return this.http.post<JournalEntry>(this.base, entry);
  }

  update(entry: JournalEntry): Observable<JournalEntry> {
    return this.http.put<JournalEntry>(
      `${this.base}/${entry.id}`, entry
    );
  }

  addEvent(entryId: string, ev: Event): Observable<JournalEntry> {
    return this.http.post<JournalEntry>(
      `${this.base}/${entryId}/events`, ev
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
