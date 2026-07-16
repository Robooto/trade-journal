import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { JournalApiService } from './journal-api.service';
import { environment } from '../../environments/environment';
import {
  BrokerActivityInbox,
  JournalEntry,
  JournalEvent,
  PaginatedJournalEntries,
} from './journal.models';

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

  it('list should include normalized search filters', () => {
    const dummy: PaginatedJournalEntries = { total: 0, items: [], skip: 15, limit: 15 };

    service.list(15, 15, ' morning plan ', ' spy ').subscribe(res => expect(res).toEqual(dummy));
    const req = http.expectOne(`${base}?skip=15&limit=15&q=morning%20plan&ticker=SPY`);
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

  it('getMarketData should perform POST request with body', () => {
    const marketUrl = `${environment.apiUrl}/trades/market-data`;
    const resp = [{ symbol: '/ESU5' }];

    service.getMarketData([], [], ['/ESU5'], []).subscribe(res => expect(res).toEqual(resp));
    const req = http.expectOne(marketUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.future).toEqual(['/ESU5']);
    req.flush(resp);
  });

  it('activityInbox resolves the previous session when no date is supplied', () => {
    const response: BrokerActivityInbox = {
      schema_version: 'broker-activity-inbox.v1',
      session_date: '2026-07-15',
      generated_at: '2026-07-16T12:00:00Z',
      events: [],
      source_status: [],
      warnings: [],
    };

    service.activityInbox().subscribe(result => expect(result).toEqual(response));
    const req = http.expectOne(`${environment.apiUrl}/broker/activity-inbox`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush(response);
  });

  it('activityInbox can request an explicit historical session', () => {
    service.activityInbox('2026-07-14').subscribe();
    const req = http.expectOne(
      `${environment.apiUrl}/broker/activity-inbox?session_date=2026-07-14`
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      schema_version: 'broker-activity-inbox.v1',
      session_date: '2026-07-14',
      generated_at: '2026-07-16T12:00:00Z',
      events: [],
      source_status: [],
      warnings: [],
    });
  });
});
