import { TestBed } from '@angular/core/testing';

import {
  TracePriceLevelsStore,
  calculatePriceLevelProximities,
  renderPriceLevels,
} from './trace-price-levels';

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

    store.add(7400, 'Support', '#34d399', 'positive_gamma');
    store.add(7450, 'Invalidation', '#fbbf24', 'negative_gamma');

    expect(store.levels().map(level => level.price)).toEqual([7450, 7400]);
    expect(store.levels().map(level => level.kind)).toEqual(['negative_gamma', 'positive_gamma']);
    expect(JSON.parse(globalThis.localStorage.getItem('trade-journal.trace.price-levels.v1') ?? '[]')).toHaveLength(2);

    store.remove(store.levels()[0].id);

    expect(store.levels().map(level => level.price)).toEqual([7400]);
  });

  it('projects only levels visible in a chart price domain', () => {
    const rendered = renderPriceLevels([
      { id: 'inside', price: 7410, label: 'Inside', color: '#fbbf24', kind: 'unclassified' },
      { id: 'outside', price: 7600, label: 'Outside', color: '#f87171', kind: 'negative_gamma' },
    ], 7400, 7420, price => price - 7400);

    expect(rendered).toEqual([
      { id: 'inside', price: 7410, label: 'Inside', color: '#fbbf24', kind: 'unclassified', position: 10 },
    ]);
  });

  it('updates the same level, reorders it and persists without duplicating', () => {
    const store = TestBed.inject(TracePriceLevelsStore);
    store.add(7400, 'Support');
    const id = store.levels()[0].id;
    store.add(7450, 'Resistance');
    expect(store.update(id, 7460, ' Revised ', '#34d399', 'positive_gamma')).toBe(true);
    expect(store.levels()).toHaveLength(2);
    expect(store.levels()[0]).toEqual({ id, price: 7460, label: 'Revised', color: '#34d399', kind: 'positive_gamma' });
    expect(new TracePriceLevelsStore().levels()).toEqual(store.levels());
    const before = store.levels();
    for (const price of [0, -1, NaN, Infinity]) expect(store.update(id, price, '', '#ffffff', 'unclassified')).toBe(false);
    expect(store.update('missing', 7460, '', '#ffffff', 'unclassified')).toBe(false);
    expect(store.levels()).toBe(before);
  });

  it('classifies watch, near, and touch distances and approach direction', () => {
    const levels = [
      { id: 'touch', price: 7410, label: 'Touch', color: '#fbbf24', kind: 'positive_gamma' as const },
      { id: 'near', price: 7416, label: 'Near', color: '#fbbf24', kind: 'negative_gamma' as const },
      { id: 'watch', price: 7419, label: 'Watch', color: '#fbbf24', kind: 'unclassified' as const },
      { id: 'far', price: 7430, label: 'Far', color: '#fbbf24', kind: 'unclassified' as const },
    ];

    const proximity = calculatePriceLevelProximities(levels, 7412, 7408);

    expect(proximity.map(level => [level.id, level.proximityState])).toEqual([
      ['touch', 'touch'],
      ['near', 'near'],
      ['watch', 'watch'],
      ['far', 'far'],
    ]);
    expect(proximity.find(level => level.id === 'near')?.approachDirection).toBe('approaching');
  });

  it('migrates stored v1 levels without a gamma type to unclassified', () => {
    globalThis.localStorage.setItem('trade-journal.trace.price-levels.v1', JSON.stringify([
      { id: 'legacy', price: 7410, label: 'Legacy level', color: '#fbbf24' },
    ]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const store = TestBed.inject(TracePriceLevelsStore);

    expect(store.levels()[0].kind).toBe('unclassified');
  });
});
