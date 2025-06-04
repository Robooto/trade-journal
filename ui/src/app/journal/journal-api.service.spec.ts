import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { JournalApiService } from './journal-api.service';
import { environment } from '../../environments/environment';
import { JournalEntry, JournalEvent, PaginatedJournalEntries } from './journal.models';

describe('JournalApiService', () => {
  let service: JournalApiService;
  let http: HttpTestingController;
  const base = `${environment.apiUrl}/entries`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [JournalApiService]
    });
    service = TestBed.inject(JournalApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('list should perform GET request', () => {
    const dummy: PaginatedJournalEntries = { total: 0, items: [], skip: 0, limit: 20 };

    service.list().subscribe(res => expect(res).toEqual(dummy));
    const req = http.expectOne(`${base}?skip=0&limit=20`);
    expect(req.request.method).toBe('GET');
    req.flush(dummy);
  });

  it('create should perform POST request', () => {
    const newEntry: Omit<JournalEntry, 'id'> = { date: '2025-01-01', esPrice: 0, delta: 0, marketDirection: 'up', notes: '', events: [] };
    const created: JournalEntry = { ...newEntry, id: '1' };

    service.create(newEntry).subscribe(res => expect(res).toEqual(created));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('POST');
    req.flush(created);
  });

  it('update should perform PUT request', () => {
    const entry: JournalEntry = { id: '1', date: '2025-01-01', esPrice: 0, delta: 0, marketDirection: 'up', notes: '', events: [] };

    service.update(entry).subscribe(res => expect(res).toEqual(entry));
    const req = http.expectOne(`${base}/${entry.id}`);
    expect(req.request.method).toBe('PUT');
    req.flush(entry);
  });

  it('addEvent should perform POST request', () => {
    const event: JournalEvent = { time: 'now', price: 1, note: 'note' };
    const response: JournalEntry = { id: '1', date: '2025-01-01', esPrice: 0, delta: 0, marketDirection: 'up', notes: '', events: [event] };

    service.addEvent('1', event).subscribe(res => expect(res).toEqual(response));
    const req = http.expectOne(`${base}/1/events`);
    expect(req.request.method).toBe('POST');
    req.flush(response);
  });

  it('delete should perform DELETE request', () => {
    service.delete('1').subscribe(res => expect(res).toBeNull());
    const req = http.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
