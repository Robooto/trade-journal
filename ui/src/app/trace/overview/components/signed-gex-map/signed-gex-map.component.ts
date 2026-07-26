import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';

import {
  TraceDashboardRow,
  TraceHistogramRow,
} from '../../trace.models';
import { selectKeyGexNodes } from '../../signed-gex-node-selection';

type WindowMode = 'near' | 'full';
type DetailMode = 'key' | 'all';

interface RenderNode {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly negative: boolean;
  readonly path: string;
  readonly cssClass: string;
  readonly opacity: number;
  readonly title: string;
}

interface AxisTick {
  readonly position: number;
  readonly label: string;
}
@Component({
  selector: 'app-signed-gex-map',
  templateUrl: './signed-gex-map.component.html',
  styleUrls: ['./signed-gex-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class SignedGexMapComponent implements OnChanges {
  @Input() rows: readonly TraceDashboardRow[] = [];
  @Input() nodes: readonly TraceHistogramRow[] = [];
  @Input() activeIndex = 0;

  readonly mapWidth = 1200;
  readonly mapHeight = 440;

  windowMode: WindowMode = 'near';
  detailMode: DetailMode = 'key';
  renderNodes: readonly RenderNode[] = [];
  yTicks: readonly AxisTick[] = [];
  xTicks: readonly AxisTick[] = [];
  spotPoints = '';
  activeX = 0;
  activeY = 0;
  activeNodes: readonly TraceHistogramRow[] = [];

  ngOnChanges(): void {
    this.rebuildMap();
  }

  setWindowMode(mode: WindowMode): void {
    if (mode === this.windowMode) return;
    this.windowMode = mode;
    this.rebuildMap();
  }

  setDetailMode(mode: DetailMode): void {
    if (mode === this.detailMode) return;
    this.detailMode = mode;
    this.rebuildMap();
  }

  formatPercent(value: number | null): string {
    return value == null ? '\u2014' : `${(value * 100).toFixed(1)}%`;
  }

  formatCompact(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '\u2014';
    const absolute = Math.abs(value);
    const sign = value < 0 ? '\u2212' : '';
    if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(2)}B`;
    if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `${sign}${(absolute / 1_000).toFixed(1)}K`;
    return `${Math.round(value * 10) / 10}`;
  }

  labelize(value: string | null | undefined): string {
    if (!value) return 'Unavailable';
    return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  private rebuildMap(): void {
    if (!this.rows.length) {
      this.clearMap();
      return;
    }

    const activeIndex = clamp(this.activeIndex, 0, this.rows.length - 1);
    const activeRow = this.rows[activeIndex];
    const [minimum, maximum] = this.visibleDomain(activeIndex, activeRow);
    const x = (index: number) => 58 + index / Math.max(1, this.rows.length - 1) * (this.mapWidth - 94);
    const y = (strike: number) => 18 + (maximum - strike) / Math.max(1, maximum - minimum) * (this.mapHeight - 62);
    const rowIndex = new Map(this.rows.map((row, index) => [row.capture_id, index]));
    const visibleNodes = this.nodes.filter(node =>
      Number.isFinite(node.center_strike) &&
      (this.windowMode === 'full' || (node.center_strike >= minimum && node.center_strike <= maximum)),
    );
    const selectedNodes = this.detailMode === 'key'
      ? selectKeyGexNodes(visibleNodes, this.rows)
      : visibleNodes;

    this.renderNodes = selectedNodes.flatMap((node, nodeIndex): RenderNode[] => {
      const index = rowIndex.get(node.capture_id);
      if (index == null) return [];
      const radius = 2.8 + Math.min(10, Math.sqrt(Math.max(0, node.cluster_share ?? 0)) * 18);
      const negative = node.gamma_sign === 'negative';
      const nodeX = x(index);
      const nodeY = y(node.center_strike);
      const distance = this.rows[index].spot == null
        ? 999
        : Math.abs(node.center_strike - (this.rows[index].spot as number));
      return [{
        key: `${node.capture_id}:${node.gamma_sign}:${node.timestamp}:${node.center_strike}:${nodeIndex}`,
        x: nodeX,
        y: nodeY,
        radius,
        negative,
        path: diamondPath(nodeX, nodeY, radius),
        cssClass: `gex-node gex-node--${negative ? 'negative' : 'positive'} gex-state--${stateKey(node.state)}`,
        opacity: nodeOpacity(node.state, distance, this.windowMode),
        title: `${formatTime(node.ts)} · ${negative ? 'Negative' : 'Positive'} GEX · ${node.center_strike.toFixed(1)} · ${this.labelize(node.state)} · ${this.formatPercent(node.cluster_share)}`,
      }];
    });
    this.yTicks = makeTicks(minimum, maximum, 5).map(value => ({
      position: y(value),
      label: `${Math.round(value)}`,
    }));
    this.xTicks = timeTicks(this.rows, x);
    this.spotPoints = this.rows
      .map((row, index) => row.spot == null ? null : `${x(index).toFixed(2)},${y(row.spot).toFixed(2)}`)
      .filter((point): point is string => Boolean(point))
      .join(' ');
    this.activeX = x(activeIndex);
    this.activeY = y(activeRow.spot ?? (minimum + maximum) / 2);
    const selectedCaptureNodes = visibleNodes.filter(node => node.capture_id === activeRow.capture_id);
    this.activeNodes = selectKeyGexNodes(selectedCaptureNodes, [activeRow])
      .sort((left, right) => (right.cluster_share ?? 0) - (left.cluster_share ?? 0))
      .slice(0, 6);
  }

  private visibleDomain(activeIndex: number, activeRow: TraceDashboardRow): [number, number] {
    if (this.windowMode === 'near' && activeRow.spot != null) {
      const recentSpots = this.rows
        .slice(Math.max(0, activeIndex - 12), activeIndex + 1)
        .map(row => row.spot)
        .filter((spot): spot is number => spot != null && Number.isFinite(spot));
      return [
        Math.min(activeRow.spot, ...recentSpots) - 75,
        Math.max(activeRow.spot, ...recentSpots) + 75,
      ];
    }
    const values = [
      ...this.nodes.map(node => node.center_strike),
      ...this.rows.map(row => row.spot).filter((spot): spot is number => spot != null),
    ].filter(Number.isFinite);
    if (!values.length) return [0, 1];
    return [Math.min(...values) - 20, Math.max(...values) + 20];
  }

  private clearMap(): void {
    this.renderNodes = [];
    this.yTicks = [];
    this.xTicks = [];
    this.spotPoints = '';
    this.activeNodes = [];
  }
}

function stateKey(value: string): string {
  const normalized = value.toLowerCase();
  return ['strengthening', 'weakening', 'forming', 'migrating', 'collapsing', 'collapsed', 'faded']
    .includes(normalized) ? normalized : 'stable';
}

function nodeOpacity(state: string, distance: number, mode: WindowMode): number {
  const normalized = state.toUpperCase();
  if (normalized === 'FADED' || normalized === 'COLLAPSED') return 0.24;
  if (mode === 'near' && distance > 55) return 0.34;
  return 0.84;
}

function diamondPath(x: number, y: number, radius: number): string {
  return `M${x},${y - radius} L${x + radius},${y} L${x},${y + radius} L${x - radius},${y} Z`;
}

function makeTicks(minimum: number, maximum: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    minimum + (maximum - minimum) * index / Math.max(1, count - 1),
  );
}

function timeTicks(
  rows: readonly TraceDashboardRow[],
  x: (index: number) => number,
): AxisTick[] {
  const step = Math.max(1, Math.ceil(rows.length / 7));
  return rows.flatMap((row, index) =>
    index % step === 0 || index === rows.length - 1
      ? [{ position: x(index), label: formatTime(row.ts) }]
      : [],
  );
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(parsed);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
