import { BehaviorSubject, of } from 'rxjs';

import { PivotLevel } from '../pivot-tracker.service';
import { PivotTrackerPageComponent } from './pivot-tracker-page.component';

describe('PivotTrackerPageComponent', () => {
  it('defaults an updated pivot to today while retaining the latest price and index', () => {
    const latest: PivotLevel = {
      id: 1,
      price: 6400,
      date: '2026-07-15',
      index: 'SPX',
    };
    const latest$ = new BehaviorSubject<PivotLevel | null>(latest);
    const dialog = {
      open: vi.fn((_component: unknown, config: { data: Record<string, unknown> }) => ({
        afterClosed: () => of(undefined),
        config,
      })),
    };
    const pivotTracker = {
      latest$,
      loadLatest: vi.fn(() => of(latest)),
      setLatest: vi.fn(),
      getHistory: vi.fn(() => of([])),
      recordPivot: vi.fn(() => of(latest)),
    };
    const snackBar = { open: vi.fn() };
    const component = new PivotTrackerPageComponent(
      pivotTracker as never,
      dialog as never,
      snackBar as never
    );
    const today = new Date();

    component.openEditor();

    const dialogData = dialog.open.mock.calls[0][1].data as {
      price: number;
      index: string;
      date: Date;
    };
    expect(dialogData.price).toBe(6400);
    expect(dialogData.index).toBe('SPX');
    expect(dialogData.date).toBeInstanceOf(Date);
    expect(dialogData.date.getFullYear()).toBe(today.getFullYear());
    expect(dialogData.date.getMonth()).toBe(today.getMonth());
    expect(dialogData.date.getDate()).toBe(today.getDate());
    expect(dialogData.date.toISOString().slice(0, 10)).not.toBe(latest.date);
  });
});
