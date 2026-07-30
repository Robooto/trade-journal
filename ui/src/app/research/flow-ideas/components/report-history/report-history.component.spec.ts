import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../../../shared/material.module';
import {
  FlowHistoryRow,
  FlowSymbolHistoryResponse,
} from '../../flow-ideas.models';
import { ReportHistoryComponent } from './report-history.component';

describe('ReportHistoryComponent', () => {
  let fixture: ComponentFixture<ReportHistoryComponent>;
  let component: ReportHistoryComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReportHistoryComponent],
      imports: [
        CommonModule,
        SharedMaterialModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportHistoryComponent);
    component = fixture.componentInstance;
  });

  it('shows the latest five trading days in the existing ascending order', () => {
    component.history = historyFixture('AAPL', 8);
    fixture.detectChanges();

    expect(renderedDates()).toEqual([
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      'Showing 5 of 8 trading days.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      '3 earlier days available.',
    );
  });

  it('prepends up to five earlier days when load more is clicked', () => {
    component.history = historyFixture('AAPL', 12);
    fixture.detectChanges();

    const loadMore = fixture.nativeElement.querySelector(
      '.history-footer button',
    ) as HTMLButtonElement;
    loadMore.click();
    fixture.detectChanges();

    expect(renderedDates()).toEqual([
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      'Showing 10 of 12 trading days.',
    );
  });

  it('resets to five days when history changes to another symbol', () => {
    component.history = historyFixture('AAPL', 12);
    component.loadMore();
    component.history = historyFixture('NVDA', 7);
    fixture.detectChanges();

    expect(renderedDates()).toEqual([
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
    ]);
    expect(component.visibleCount).toBe(5);
  });

  function renderedDates(): string[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('time'),
      (element: Element) => element.textContent?.trim() ?? '',
    );
  }
});

function historyFixture(
  symbol: string,
  dayCount: number,
): FlowSymbolHistoryResponse {
  return {
    schema_version: 'flowpatrol-symbol-history.v1',
    symbol,
    rows: Array.from({ length: dayCount }, (_, index) =>
      historyRow(symbol, index + 1),
    ),
  };
}

function historyRow(symbol: string, day: number): FlowHistoryRow {
  const tradingDate = `2026-07-${String(day).padStart(2, '0')}`;
  return {
    trading_date: tradingDate,
    symbol,
    research_priority: 60 + day,
    active_watch: true,
    watch_day: day,
    change_event: 'watching',
    reason_codes: [],
    reason_text: 'Active FlowPatrol watch.',
    spread_ids: [],
    equityhub_url: `https://example.test/${symbol}/${tradingDate}`,
  };
}
