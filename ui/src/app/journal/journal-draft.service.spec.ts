import { TestBed } from '@angular/core/testing';
import { JournalDraftService } from './journal-draft.service';

describe('JournalDraftService', () => {
  let service: JournalDraftService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(JournalDraftService);
  });

  afterEach(() => localStorage.clear());

  it('saves, loads, and clears a draft', () => {
    service.save({ notes: 'morning plan', tickers: 'SPY' });

    expect(service.load()?.value).toEqual({ notes: 'morning plan', tickers: 'SPY' });
    service.clear();
    expect(service.load()).toBeNull();
  });

  it('removes malformed draft data', () => {
    localStorage.setItem('trade-journal.entry-draft.v1', '{bad json');

    expect(service.load()).toBeNull();
    expect(localStorage.getItem('trade-journal.entry-draft.v1')).toBeNull();
  });
});