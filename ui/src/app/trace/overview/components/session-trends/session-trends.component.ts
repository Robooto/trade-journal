import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { TraceDashboardRow, TraceHistogramRow } from '../../trace.models';
import { TracePriceLevel } from '../../trace-price-levels';
import { PriceWindowMode, HiroViewMode, emptyPriceChart, emptyHiroChart } from './trend-chart.models';
import { clamp, numericValue, formatCompact, formatSignedCompact, labelize } from './trend-chart.utils';
import { buildPriceChart } from './price-chart';
import { buildHiroChart } from './hiro-chart';

@Component({
  selector: 'app-trace-session-trends',
  templateUrl: './session-trends.component.html',
  styleUrls: ['./session-trends.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class SessionTrendsComponent implements OnChanges {
  @Input() rows: readonly TraceDashboardRow[] = [];
  @Input() nodes: readonly TraceHistogramRow[] = [];
  @Input() activeIndex = 0;
  @Input() priceLevels: readonly TracePriceLevel[] = [];

  readonly width = 1200;
  readonly priceHeight = 330;
  readonly hiroHeight = 340;

  priceWindowMode: PriceWindowMode = 'near';
  priceChart = emptyPriceChart();

  hiroViewMode: HiroViewMode = 'level';
  hiroChart = emptyHiroChart();

  ngOnChanges(): void {
    this.rebuildPriceChart();
    this.rebuildHiroChart();
  }

  setPriceWindowMode(mode: PriceWindowMode): void {
    if (mode === this.priceWindowMode) return;
    this.priceWindowMode = mode;
    this.rebuildPriceChart();
  }

  setHiroViewMode(mode: HiroViewMode): void {
    if (mode === this.hiroViewMode) return;
    this.hiroViewMode = mode;
    this.rebuildHiroChart();
  }

  selectedHiroDelta(key: 'spx_hiro' | 'equities_hiro'): number | null {
    const index = clamp(this.activeIndex, 0, this.rows.length - 1);
    if (index < 1) return null;
    const current = numericValue(this.rows[index]?.[key]);
    const previous = numericValue(this.rows[index - 1]?.[key]);
    return current == null || previous == null ? null : current - previous;
  }

  activeRow(): TraceDashboardRow | null {
    if (!this.rows.length) return null;
    return this.rows[clamp(this.activeIndex, 0, this.rows.length - 1)] ?? null;
  }

  readonly formatCompact = formatCompact;

  readonly formatSignedCompact = formatSignedCompact;

  directionArrow(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value === 0) return '\u2192';
    return value > 0 ? '\u2191' : '\u2193';
  }

  readonly labelize = labelize;

  valueTone(value: number | null | undefined): 'positive' | 'negative' | 'neutral' {
    if (value == null || value === 0) return 'neutral';
    return value > 0 ? 'positive' : 'negative';
  }

  hiroRelationshipLabel(row: TraceDashboardRow): string {
    if (row.hiro_relationship_class === 'opposing' && row.hiro_balance_score != null) {
      return `Opposing \u00b7 ${Math.round(row.hiro_balance_score * 100)}% balanced`;
    }
    if (row.hiro_relationship_class === 'aligned') return 'Aligned';
    if (row.hiro_relationship_class === 'flat_or_zero') return 'Flat / zero';
    return 'Unavailable';
  }

  gammaLabel(value: string | null | undefined): string {
    if (!value) return 'Gamma unavailable';
    return `${this.labelize(value)} gamma`;
  }

  private rebuildPriceChart(): void {
    this.priceChart = buildPriceChart({ rows: this.rows, activeIndex: this.activeIndex,
      priceLevels: this.priceLevels, width: this.width, height: this.priceHeight }, this.nodes, this.priceWindowMode);
  }

  private rebuildHiroChart(): void {
    this.hiroChart = buildHiroChart({ rows: this.rows, activeIndex: this.activeIndex,
      priceLevels: this.priceLevels, width: this.width, height: this.hiroHeight }, this.hiroViewMode);
  }
}
