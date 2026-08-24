import { Injectable, signal } from '@angular/core';

export interface TracePriceLevel {
  readonly id: string;
  readonly price: number;
  readonly label: string;
  readonly color: string;
}

export interface RenderedPriceLevel extends TracePriceLevel {
  readonly position: number;
}

const STORAGE_KEY = 'trade-journal.trace.price-levels.v1';
const DEFAULT_COLOR = '#fbbf24';

@Injectable({ providedIn: 'root' })
export class TracePriceLevelsStore {
  private readonly state = signal<readonly TracePriceLevel[]>(readStoredLevels());

  readonly levels = this.state.asReadonly();

  add(price: number, label: string, color = DEFAULT_COLOR): void {
    if (!Number.isFinite(price) || price <= 0) return;
    const normalizedLabel = label.trim() || formatPrice(price);
    const next = [
      ...this.state(),
      {
        id: makeId(),
        price,
        label: normalizedLabel,
        color: validColor(color) ? color : DEFAULT_COLOR,
      },
    ].sort((left, right) => right.price - left.price);
    this.write(next);
  }

  remove(id: string): void {
    this.write(this.state().filter(level => level.id !== id));
  }

  private write(levels: readonly TracePriceLevel[]): void {
    this.state.set(levels);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(levels));
    } catch {
      // Browser storage can be unavailable or full; the in-memory state remains useful.
    }
  }
}

export function renderPriceLevels(
  levels: readonly TracePriceLevel[],
  minimum: number,
  maximum: number,
  scale: (price: number) => number,
): readonly RenderedPriceLevel[] {
  return levels
    .filter(level => level.price >= minimum && level.price <= maximum)
    .map(level => ({ ...level, position: scale(level.price) }));
}

function readStoredLevels(): readonly TracePriceLevel[] {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate): TracePriceLevel[] => {
      if (!candidate || typeof candidate !== 'object') return [];
      const value = candidate as Partial<TracePriceLevel>;
      if (
        typeof value.id !== 'string' ||
        typeof value.price !== 'number' ||
        !Number.isFinite(value.price) ||
        value.price <= 0 ||
        typeof value.label !== 'string' ||
        typeof value.color !== 'string'
      ) return [];
      return [{ id: value.id, price: value.price, label: value.label, color: value.color }];
    }).sort((left, right) => right.price - left.price);
  } catch {
    return [];
  }
}

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `level-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatPrice(price: number): string {
  return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function validColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
