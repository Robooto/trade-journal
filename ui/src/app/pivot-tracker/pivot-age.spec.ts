import { PIVOT_STALE_DAYS, pivotAgeDays } from './pivot-tracker.service';
import { PivotTrackerPageComponent } from './pivot-tracker-page/pivot-tracker-page.component';

describe('pivot age', () => {
  it('counts calendar days and rejects invalid dates', () => {
    const today = new Date(2026, 9, 16, 18, 30);
    expect(pivotAgeDays('2026-10-16', today)).toBe(0);
    expect(pivotAgeDays('2026-09-22', today)).toBe(24);
    expect(pivotAgeDays('2026-09-22T00:00:00', today)).toBe(24);
    expect(pivotAgeDays('not-a-date', today)).toBeNull();
    expect(pivotAgeDays(null, today)).toBeNull();
    expect(PIVOT_STALE_DAYS).toBe(7);
  });

  it('reports the change from the previous level of the same index, newest first', () => {
    const page = Object.create(PivotTrackerPageComponent.prototype) as PivotTrackerPageComponent;
    page.history = [
      { id: 4, index: 'SPX', price: 7690, date: '2026-09-22' },
      { id: 3, index: 'NDX', price: 25000, date: '2026-09-15' },
      { id: 2, index: 'SPX', price: 7590, date: '2026-09-10' },
      { id: 1, index: 'SPX', price: 7590, date: '2026-09-04' },
    ];
    expect(page.changeFromPrevious(0)).toBe(100);
    expect(page.changeFromPrevious(1)).toBeNull();
    expect(page.changeFromPrevious(2)).toBe(0);
    expect(page.changeFromPrevious(3)).toBeNull();
  });
});
