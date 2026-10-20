import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import {
  TraceDashboardRow,
  TraceRealizedVolatilityResponse,
  TraceRealizedVolatilityRow,
} from '../../trace.models';

/**
 * One compact row of facts for the selected capture. HIRO, nodes and strike-level evidence live
 * in their own panels (HIRO flow, GEX map, strike ladder), so they are not repeated here.
 */
@Component({
  selector: 'app-trace-market-snapshot',
  templateUrl: './market-snapshot.component.html',
  styleUrls: ['./market-snapshot.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class MarketSnapshotComponent {
  @Input() rows: readonly TraceDashboardRow[] = [];
  @Input() activeIndex = 0;
  @Input() realizedVolatility: TraceRealizedVolatilityResponse | null = null;

  get activeRow(): TraceDashboardRow | null {
    return this.rows[this.activeIndex] ?? null;
  }

  get spotMove(): number | null {
    const row = this.activeRow;
    if (row?.spot == null) return null;
    const previous = this.rows[Math.max(0, this.activeIndex - 1)];
    return previous?.spot == null ? null : row.spot - previous.spot;
  }

  get volatility(): TraceRealizedVolatilityRow | null {
    // Volatility is measured on ten-minute captures; a five-minute capture shows the latest one at or before it.
    const ts = this.activeRow?.ts;
    if (!ts) return null;
    const rows = (this.realizedVolatility?.rows ?? []).filter(row => row.as_of <= ts);
    return rows.length ? rows[rows.length - 1] : null;
  }

  valueTone(value: number | null | undefined): 'positive' | 'negative' | 'neutral' {
    if (value == null || value === 0) return 'neutral';
    return value > 0 ? 'positive' : 'negative';
  }

  gammaTone(): 'positive' | 'negative' | 'neutral' {
    const sign = this.activeRow?.pocket_sign;
    return sign === 'positive' ? 'positive' : sign === 'negative' ? 'negative' : 'neutral';
  }

  gammaLabel(): string {
    if (this.activeRow?.pocket_sign === 'positive') return 'Positive';
    if (this.activeRow?.pocket_sign === 'negative') return 'Negative';
    return 'Transition';
  }

  gammaNote(): string {
    if (this.activeRow?.pocket_sign === 'positive') return 'containment context';
    if (this.activeRow?.pocket_sign === 'negative') return 'expansion context';
    return 'no clear pocket';
  }

  volatilityTone(): 'warning' | 'neutral' {
    return this.volatility?.classification_status === 'ready' && this.volatility.realized_vol_regime === 'high_realized'
      ? 'warning'
      : 'neutral';
  }

  volatilityLabel(): string {
    const regime = this.volatility?.realized_vol_regime;
    if (regime === 'low_realized') return 'Low';
    if (regime === 'mid_realized') return 'Medium';
    if (regime === 'high_realized') return 'High';
    return this.volatility?.classification_status === 'current_window_missing' ? 'Building' : '—';
  }

  shelfTone(): 'positive' | 'negative' | 'neutral' {
    if (this.activeRow?.shelf_direction === 'up') return 'positive';
    if (this.activeRow?.shelf_direction === 'down') return 'negative';
    return 'neutral';
  }

  wallNote(): string {
    const row = this.activeRow;
    if (row?.spot == null) return 'distance unavailable';
    const levels = [
      { label: 'put', value: row.put_wall },
      { label: 'hedge', value: row.hedge_wall },
      { label: 'call', value: row.call_wall },
    ].filter((level): level is { label: string; value: number } => level.value != null && Number.isFinite(level.value));
    if (!levels.length) return 'distance unavailable';
    const nearest = levels.sort((left, right) => Math.abs(left.value - row.spot!) - Math.abs(right.value - row.spot!))[0];
    return `${nearest.label} ${this.formatSpot(Math.abs(nearest.value - row.spot))} pts away`;
  }

  structureLabel(type: string | null | undefined): string {
    return type ? this.labelize(type) : '—';
  }

  formatSpot(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }

  formatSignedPoints(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1).replace(/\.0$/, '')}`;
  }

  formatBps(value: number | null | undefined): string {
    return value == null ? '—' : `${value.toFixed(1)} bps`;
  }

  formatTime(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
  }

  labelize(value: string | null | undefined): string {
    if (!value) return '—';
    return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }
}
