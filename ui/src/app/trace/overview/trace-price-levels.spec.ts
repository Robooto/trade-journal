import { TestBed } from '@angular/core/testing';

import { TracePriceLevelsStore, renderPriceLevels } from './trace-price-levels';

describe('TracePriceLevelsStore', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    globalThis.localStorage.clear();
  });

  it('persists sorted marked levels and removes them by id', () => {
    const store = TestBed.inject(TracePriceLevelsStore);

    store.add(7400, 'Support', '#34d399');
    store.add(7450, 'Invalidation', '#fbbf24');

    expect(store.levels().map(level => level.price)).toEqual([7450, 7400]);
    expect(JSON.parse(globalThis.localStorage.getItem('trade-journal.trace.price-levels.v1') ?? '[]')).toHaveLength(2);

    store.remove(store.levels()[0].id);

    expect(store.levels().map(level => level.price)).toEqual([7400]);
  });

  it('projects only levels visible in a chart price domain', () => {
    const rendered = renderPriceLevels([
      { id: 'inside', price: 7410, label: 'Inside', color: '#fbbf24' },
      { id: 'outside', price: 7600, label: 'Outside', color: '#f87171' },
    ], 7400, 7420, price => price - 7400);

    expect(rendered).toEqual([
      { id: 'inside', price: 7410, label: 'Inside', color: '#fbbf24', position: 10 },
    ]);
  });
});
