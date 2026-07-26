import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { CharmOverview, CharmSeriesPoint } from '../../../charm/charm.models';
import {
  TraceDashboardRow,
  TraceGammaContextRow,
  TraceHistogramRow,
  TraceRealizedVolatilityResponse,
  TraceRealizedVolatilityRow,
} from '../../trace.models';

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
  @Input() histogramNodes: readonly TraceHistogramRow[] = [];
  @Input() gammaContextRows: readonly TraceGammaContextRow[] = [];
  @Input() realizedVolatility: TraceRealizedVolatilityResponse | null = null;
  @Input() charmOverview: CharmOverview | null = null;
  @Input() charmLoading = false;
  @Input() charmError: string | null = null;

  get activeRow(): TraceDashboardRow | null {
    return this.rows[this.activeIndex] ?? null;
  }

  get spotMove(): number | null {
    const row = this.activeRow;
    if (row?.spot == null) return null;
    const previous = this.rows[Math.max(0, this.activeIndex - 1)];
    return previous?.spot == null ? null : row.spot - previous.spot;
  }

  get gammaContext(): TraceGammaContextRow | null {
    const captureId = this.activeRow?.capture_id;
    return this.gammaContextRows.find(row => row.capture_id === captureId) ?? null;
  }

  get volatility(): TraceRealizedVolatilityRow | null {
    const captureId = this.activeRow?.capture_id;
    return this.realizedVolatility?.rows.find(row => row.capture_id === captureId) ?? null;
  }

  get charm(): CharmSeriesPoint | null {
    const captureId = this.activeRow?.capture_id;
    return this.charmOverview?.series.find(row => row.capture_id === captureId) ?? null;
  }

  get activeNodes(): readonly TraceHistogramRow[] {
    const captureId = this.activeRow?.capture_id;
    return this.histogramNodes
      .filter(node => node.capture_id === captureId)
      .sort((left, right) => (right.cluster_share ?? 0) - (left.cluster_share ?? 0));
  }

  topNodes(sign: 'positive' | 'negative'): readonly TraceHistogramRow[] {
    const nodes = this.activeNodes.filter(node =>
      sign === 'negative' ? node.gamma_sign === 'negative' : node.gamma_sign !== 'negative',
    );
    const unique: TraceHistogramRow[] = [];
    for (const node of nodes) {
      if (!unique.some(existing => Math.abs(existing.center_strike - node.center_strike) < 0.25)) {
        unique.push(node);
      }
    }
    return unique.slice(0, 2);
  }

  nodeCount(sign: 'positive' | 'negative'): number {
    return this.activeNodes.filter(node =>
      sign === 'negative' ? node.gamma_sign === 'negative' : node.gamma_sign !== 'negative',
    ).length;
  }

  flowTone(): 'positive' | 'negative' | 'warning' | 'neutral' {
    const relationship = this.activeRow?.flow_relationship;
    if (relationship === 'aligned_up') return 'positive';
    if (relationship === 'aligned_down') return 'negative';
    if (relationship === 'divergent' || relationship === 'spx_only') return 'warning';
    return 'neutral';
  }

  gammaTone(): 'warning' | 'neutral' {
    const sign = this.activeRow?.pocket_sign;
    return sign === 'negative' || sign === 'flat' ? 'warning' : 'neutral';
  }

  volatilityTone(): 'warning' | 'neutral' {
    return this.volatility?.classification_status === 'ready' && this.volatility.realized_vol_regime === 'high_realized'
      ? 'warning'
      : 'neutral';
  }

  valueTone(value: number | null | undefined): 'positive' | 'negative' | 'neutral' {
    if (value == null || value === 0) return 'neutral';
    return value > 0 ? 'positive' : 'negative';
  }

  shelfTone(): 'positive' | 'negative' | 'neutral' {
    if (this.activeRow?.shelf_direction === 'up') return 'positive';
    if (this.activeRow?.shelf_direction === 'down') return 'negative';
    return 'neutral';
  }

  gammaLabel(): string {
    if (this.activeRow?.pocket_sign === 'positive') return 'Containment (+)';
    if (this.activeRow?.pocket_sign === 'negative') return 'Expansion (−)';
    return 'Transition / weak gamma';
  }

  volatilityLabel(): string {
    const regime = this.volatility?.realized_vol_regime;
    if (regime === 'low_realized') return 'Low movement';
    if (regime === 'mid_realized') return 'Medium movement';
    if (regime === 'high_realized') return 'High movement';
    return this.volatility?.classification_status === 'current_window_missing' ? 'Building' : 'Unavailable';
  }

  wallNote(): string {
    const row = this.activeRow;
    if (row?.spot == null) return 'Distance unavailable';
    const levels = [
      { label: 'put', value: row.put_wall },
      { label: 'hedge', value: row.hedge_wall },
      { label: 'call', value: row.call_wall },
    ].filter((level): level is { label: string; value: number } => level.value != null && Number.isFinite(level.value));
    if (!levels.length) return 'Distance unavailable';
    const nearest = levels.sort((left, right) => Math.abs(left.value - row.spot!) - Math.abs(right.value - row.spot!))[0];
    return `${nearest.label} ${this.formatSpot(Math.abs(nearest.value - row.spot))} pts away`;
  }

  threshold(name: string): number | null {
    const value = this.realizedVolatility?.thresholds?.[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  formatSpot(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  }

  formatCompact(value: number | null | undefined, signed = false): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
    if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return `${sign}${Math.round(absolute * 10) / 10}`;
  }

  formatSignedPoints(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(1).replace(/\.0$/, '')}`;
  }

  formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds)) return 'unavailable';
    if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
    return `${Math.round(seconds)}s`;
  }

  formatPercent(value: number | null | undefined): string {
    return value == null ? '—' : `${(value * 100).toFixed(1)}%`;
  }

  formatBps(value: number | null | undefined): string {
    return value == null ? '—' : `${value.toFixed(1)} bps`;
  }

  formatTime(value: string | null | undefined): string {
    if (!value) return 'Unavailable';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
  }

  labelize(value: string | null | undefined): string {
    if (!value) return 'Unavailable';
    return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  nodeStateClass(value: string): string {
    const normalized = value.toLowerCase();
    return ['strengthening', 'weakening', 'forming', 'migrating', 'collapsing', 'collapsed', 'faded']
      .includes(normalized) ? `snapshot-node--${normalized}` : 'snapshot-node--stable';
  }
}
