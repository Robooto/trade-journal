import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { TraceCollectionStatus } from '../../trace.models';
import { CollectionStatusComponent } from './collection-status.component';

const status: TraceCollectionStatus = {
  schema_version: 'trace-collection-status.v1', date: '2026-10-21', order_submission_enabled: false,
  trace: { captures: 20, first_ts: '2026-10-21T06:20:05-07:00', latest_ts: '2026-10-21T09:30:05-07:00' },
  chain_grid: { status: 'recorded', recorded: 19, skipped: 1, latest_captured_at: '2026-10-21T09:30:14-07:00', settlement: null },
};

describe('CollectionStatusComponent', () => {
  let api: { collectionStatus: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { collectionStatus: vi.fn(() => of(status)) };
    await TestBed.configureTestingModule({ imports: [CollectionStatusComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  function render(now: string) {
    const fixture = TestBed.createComponent(CollectionStatusComponent);
    fixture.componentRef.setInput('now', () => new Date(now));
    fixture.componentRef.setInput('date', '2026-10-21');
    fixture.detectChanges();
    return fixture;
  }

  it('shows captures, snapshots and settlement on one line, live while captures are fresh', () => {
    const fixture = render('2026-10-21T09:35:00-07:00');
    const line = fixture.nativeElement.querySelector('.collection-line');
    expect(line.dataset.state).toBe('live');
    expect(line.textContent.replace(/\s+/g, ' ')).toContain('TRACE 20 captures · latest 9:30 AM');
    expect(line.textContent).toContain('Chain grid 19 snapshots · 1 skipped');
    expect(line.textContent).toContain('Not settled yet');
  });

  it('flags an overdue capture during the session and reads as closed afterwards', () => {
    expect(render('2026-10-21T09:50:00-07:00').nativeElement.querySelector('.collection-line').dataset.state).toBe('stale');
    expect(render('2026-10-21T16:00:00-07:00').nativeElement.querySelector('.collection-line').dataset.state).toBe('closed');
    api.collectionStatus.mockReturnValue(throwError(() => new Error('down')));
    expect(render('2026-10-21T09:35:00-07:00').nativeElement.textContent).toContain('Collection status unavailable.');
  });
});
