import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

import { JournalPageComponent } from './journal-page.component';
import { JournalApiService } from '../journal-api.service';
import { JournalEntry, PaginatedJournalEntries } from '../journal.models';

class MockJournalApiService {
  response: PaginatedJournalEntries = { total: 0, items: [], skip: 0, limit: 20 };
  list(_skip: number = 0, _limit: number = 20) {
    return of(this.response);
  }
}

function makeEntry(id: string, date: string): JournalEntry {
  return { id, date, esPrice: 0, delta: 0, notes: '', events: [], marketDirection: 'up' };
}

describe('JournalPageComponent', () => {
  let component: JournalPageComponent;
  let fixture: ComponentFixture<JournalPageComponent>;
  let api: MockJournalApiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [JournalPageComponent],
      providers: [{ provide: JournalApiService, useClass: MockJournalApiService }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    }).compileComponents();

    api = TestBed.inject(JournalApiService) as unknown as MockJournalApiService;
    fixture = TestBed.createComponent(JournalPageComponent);
    component = fixture.componentInstance;
  });

  it('loadNextPage sorts items by date and appends them while updating totals', () => {
    component.entries = [makeEntry('x', '2024-06-01')];
    api.response = {
      total: 3,
      items: [
        makeEntry('b', '2024-06-03'),
        makeEntry('a', '2024-06-02')
      ],
      skip: 0,
      limit: 20
    };

    component.loadNextPage();

    expect(component.entries.map(e => e.id)).toEqual(['x', 'a', 'b']);
    expect(component.totalEntries).toBe(3);
    expect(component.pageSkip).toBe(15);
  });

  it('onEntrySelected stores the selected entry', () => {
    const entry = makeEntry('s', '2024-06-04');
    component.onEntrySelected(entry);
    expect(component.selectedEntry).toBe(entry);
  });

  it('onEntrySaved clears selection and reloads first page', () => {
    component.entries = [makeEntry('old', '2024-05-01')];
    component.pageSkip = 20;
    component.selectedEntry = component.entries[0];
    api.response = {
      total: 1,
      items: [makeEntry('new', '2024-06-01')],
      skip: 0,
      limit: 20
    };

    component.onEntrySaved(component.selectedEntry);

    expect(component.selectedEntry).toBeUndefined();
    expect(component.pageSkip).toBe(15);
    expect(component.entries.map(e => e.id)).toEqual(['new']);
    expect(component.totalEntries).toBe(1);
  });

  it('onEditCancelled clears the selected entry', () => {
    component.selectedEntry = makeEntry('1', '2024-06-01');
    component.onEditCancelled();
    expect(component.selectedEntry).toBeUndefined();
  });

  it('onEntryDeleted removes the entry and updates totals', () => {
    const e1 = makeEntry('1', '2024-06-01');
    const e2 = makeEntry('2', '2024-06-02');
    component.entries = [e1, e2];
    component.totalEntries = 2;
    component.selectedEntry = e1;

    component.onEntryDeleted('1');

    expect(component.entries).toEqual([e2]);
    expect(component.totalEntries).toBe(1);
    expect(component.selectedEntry).toBeUndefined();
  });
});
