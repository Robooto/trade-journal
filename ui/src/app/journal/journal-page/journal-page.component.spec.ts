import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

import { JournalPageComponent } from './journal-page.component';
import { JournalApiService } from '../journal-api.service';
import {
  BrokerActivityInbox,
  JournalEntry,
  PaginatedJournalEntries,
} from '../journal.models';

const activityInbox: BrokerActivityInbox = {
  schema_version: 'broker-activity-inbox.v1',
  session_date: '2026-07-15',
  generated_at: '2026-07-16T12:00:00Z',
  source_status: [],
  pending_count: 1,
  reviewed_count: 0,
  skipped_count: 0,
  warnings: [],
  events: [{
    activity_group_id: 'tastytrade:FAKE:group-fill:1',
    session_date: '2026-07-15',
    account_number: 'FAKE-OPTIONS',
    review_kind: 'opening',
    occurred_at: '2026-07-15T15:30:00Z',
    underlying_symbol: 'AAPL',
    grouping_status: 'explicit',
    leg_count: 2,
    net_value_dollars: 137.7,
    fees_dollars: 2.3,
    summary: 'AAPL - opening activity - 2 legs - $137.70 net credit',
    review_status: 'pending',
    market_context: {
      schema_version: 'broker-activity-market-context.v1',
      warnings: [
        'AAPL activity price is estimated from the nearest five-minute bar close.'
      ],
      underlying: {
        symbol: 'AAPL',
        source_symbol: 'AAPL',
        source: 'yahoo_chart',
        status: 'partial',
        resolution: '5m',
        activity_price: 203,
        matched_at: '2026-07-15T15:30:00Z',
        match_quality: 'nearest_5m_close',
        minutes_from_activity: 0,
        session_open: 200,
        session_high: 206,
        session_low: 198,
        session_close: 205,
        session_change_percent: 2.5,
        activity_from_open_percent: 1.5,
        bars: [
          {
            time: Date.parse('2026-07-15T13:30:00Z'),
            open: 200,
            high: 202,
            low: 198,
            close: 201,
            volume: 100,
          },
          {
            time: Date.parse('2026-07-15T15:30:00Z'),
            open: 202,
            high: 206,
            low: 201,
            close: 203,
            volume: 200,
          },
        ],
        warnings: [],
      },
      benchmark: {
        symbol: 'SPY',
        source_symbol: 'SPY',
        source: 'yahoo_chart',
        status: 'partial',
        resolution: '5m',
        activity_price: 630,
        matched_at: '2026-07-15T15:30:00Z',
        match_quality: 'nearest_5m_close',
        activity_from_open_percent: -0.25,
        bars: [],
        warnings: [],
      },
    },
    legs: [{
      activity_id: 'leg-1',
      kind: 'fill',
      occurred_at: '2026-07-15T15:30:00Z',
      action: 'Sell to Open',
      quantity: 1,
      symbol: 'AAPL 260821P00100000',
      price: 2.5,
    }, {
      activity_id: 'leg-2',
      kind: 'fill',
      occurred_at: '2026-07-15T15:30:00Z',
      action: 'Buy to Open',
      quantity: 1,
      symbol: 'AAPL 260821P00095000',
      price: 1.12,
    }],
  }],
};

class MockJournalApiService {
  activityResponse = activityInbox;
  activityInbox() {
    return of(this.activityResponse);
  }
  dispositionCalls: Array<Record<string, string | undefined>> = [];
  setActivityDisposition(
    activityGroupId: string,
    sessionDate: string,
    status: 'reviewed' | 'skipped',
    journalEntryId?: string
  ) {
    this.dispositionCalls.push({ activityGroupId, sessionDate, status, journalEntryId });
    return of({
      schema_version: 'broker-activity-disposition.v1' as const,
      activity_group_id: activityGroupId,
      session_date: sessionDate,
      status,
      journal_entry_id: journalEntryId,
      updated_at: '2026-07-16T12:00:00Z',
    });
  }
  response: PaginatedJournalEntries = { total: 0, items: [], skip: 0, limit: 20 };
  list(_skip: number = 0, _limit: number = 20, _query: string = '', _ticker: string = '') {
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

    expect(component.entries.map(e => e.id)).toEqual(['x', 'b', 'a']);
    expect(component.totalEntries).toBe(3);
    expect(component.pageSkip).toBe(2);
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
    expect(component.pageSkip).toBe(1);
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

  it('loads the previous-session activity inbox', () => {
    component.loadActivityInbox();

    expect(component.activityInbox).toEqual(activityInbox);
    expect(component.activityError).toBe('');
  });

  it('prefills a factual journal draft from brokerage activity', () => {
    component.activityInbox = activityInbox;

    component.addActivityToJournal(activityInbox.events[0]);

    expect(component.showForm).toBe(true);
    expect(component.entryPrefill?.tickers).toEqual(['AAPL']);
    expect(component.entryPrefill?.sourceUrl).toContain('activityDate=2026-07-15');
    expect(component.entryPrefill?.notes).toContain(
      'AAPL - opening activity - 2 legs - $137.70 net credit'
    );
    expect(component.entryPrefill?.notes).toContain('Why I made this trade:');
    expect(component.entryPrefill?.notes).toContain(
      'Sell to Open 1x AAPL 260821P00100000 @ $2.50'
    );
    expect(component.entryPrefill?.notes).toContain(
      'Buy to Open 1x AAPL 260821P00095000 @ $1.12'
    );
    expect(component.entryPrefill?.notes).toContain(
      'Estimated entry-time context (nearest 5-minute close): AAPL $203.00 +1.50% from open'
    );
    expect(component.entryPrefill?.notes).toContain(
      'SPY near activity: $630.00 -0.25% from open'
    );
    expect(component.activityChartPoints(activityInbox.events[0])).not.toBe('');
    expect(component.activityMarkerX(activityInbox.events[0])).toBe(100);
    expect(component.activityMarkerY(activityInbox.events[0])).toBeGreaterThan(0);
    expect(component.entryPrefill?.activityGroupId).toBe(
      'tastytrade:FAKE:group-fill:1'
    );
  });

  it('labels grouped multi-leg activity as a spread attachment', () => {
    const spread = activityInbox.events[0];

    expect(component.activityActionLabel(spread)).toBe(
      'Add 2-leg spread to journal'
    );
    component.showForm = true;
    expect(component.activityActionLabel(spread)).toBe(
      'Add 2-leg spread to open entry'
    );
  });

  it('adds brokerage activity to the already-open journal entry', () => {
    component.activityInbox = structuredClone(activityInbox);
    const existing = makeEntry('existing-entry', '2026-07-16');
    existing.notes = 'Morning plan';
    component.selectedEntry = existing;
    component.showForm = true;

    component.addActivityToJournal(component.activityInbox.events[0]);

    expect(component.selectedEntry).toBe(existing);
    expect(component.entryPrefill?.notes).toContain('AAPL - opening activity');
    expect(component.pendingActivityReviews).toEqual([{
      activityGroupId: 'tastytrade:FAKE:group-fill:1',
      sessionDate: '2026-07-15',
    }]);
  });

  it('hides completed activity unless Show reviewed is enabled', () => {
    component.activityInbox = structuredClone(activityInbox);
    const event = component.activityInbox.events[0];

    component.setActivityDisposition(event, 'skipped');

    expect(component.visibleActivityEvents).toEqual([]);
    expect(component.completedActivityCount).toBe(1);
    expect(component.activityInbox.skipped_count).toBe(1);
    component.showCompletedActivity = true;
    expect(component.visibleActivityEvents).toEqual([event]);
  });

  it('marks imported activity reviewed after its journal entry saves', () => {
    component.activityInbox = structuredClone(activityInbox);
    component.addActivityToJournal(component.activityInbox.events[0]);
    const saved = makeEntry('journal-entry-1', '2026-07-16');

    component.onEntrySaved(saved);

    expect(api.dispositionCalls).toEqual([{
      activityGroupId: 'tastytrade:FAKE:group-fill:1',
      sessionDate: '2026-07-15',
      status: 'reviewed',
      journalEntryId: 'journal-entry-1',
    }]);
  });
});
