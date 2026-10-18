import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraceDashboardRow, TraceHistogramRow } from '../../trace.models';
import { SessionTrendsComponent } from './session-trends.component';
import { flatHiroFlags } from './hiro-chart';

const rows: TraceDashboardRow[] = Array.from({ length: 12 }, (_, index) => ({
  ts: `2026-07-24T${String(9 + Math.floor(index / 6)).padStart(2, '0')}:${String((index % 6) * 10).padStart(2, '0')}:00-07:00`,
  capture_id: `capture-${index + 1}`,
  spot: 7400 + index * 2,
  put_wall: 7360 + index,
  hedge_wall: 7410 + index,
  call_wall: 7470 + index,
  global_shelf_center: 7390 + index * 1.5,
  spx_hiro: -600_000_000 + index * 105_000_000,
  spx_hiro_rate_per_minute: 12_000_000 + index * 1_000_000,
  equities_hiro: 420_000_000 - index * 75_000_000,
  equities_hiro_rate_per_minute: -8_000_000 - index * 500_000,
  flow_spx_acceleration: 'strong_buying_increasing',
  flow_equities_acceleration: 'selling_increasing',
} as TraceDashboardRow));

const nodes: TraceHistogramRow[] = [
  { ts: rows[4].ts, timestamp: rows[4].ts, capture_id: rows[4].capture_id, gamma_sign: 'positive', center_strike: 7410, state: 'strengthening', cluster_share: 0.42 } as TraceHistogramRow,
  { ts: rows[7].ts, timestamp: rows[7].ts, capture_id: rows[7].capture_id, gamma_sign: 'negative', center_strike: 7420, state: 'forming', cluster_share: 0.25 } as TraceHistogramRow,
];

describe('SessionTrendsComponent', () => {
  let fixture: ComponentFixture<SessionTrendsComponent>;
  let component: SessionTrendsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SessionTrendsComponent],
      imports: [CommonModule],
    }).compileComponents();

    fixture = TestBed.createComponent(SessionTrendsComponent);
    component = fixture.componentInstance;
    component.rows = rows;
    component.nodes = nodes;
    component.activeIndex = rows.length - 1;
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders HIRO and spot series without a separate price chart', () => {
    expect(fixture.nativeElement.textContent).toContain('HIRO flow');
    expect(fixture.nativeElement.textContent).not.toContain('Price, walls, and shelf');
    expect(fixture.nativeElement.querySelector('.trend-svg--price')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.trend-svg--hiro polyline')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.trend-line--spx-hiro')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.trend-line--equities-hiro')).not.toBeNull();
  });

  it('defaults to HIRO pressure while preserving the change view', () => {
    expect(component.hiroViewMode).toBe('level');
    expect(fixture.nativeElement.textContent).toContain('context, not a signal');
    const changeButton = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.trend-segment button'),
    ).find(button => button.textContent?.trim() === 'Change');
    changeButton?.click();
    fixture.detectChanges();
    expect(component.hiroViewMode).toBe('change');
    expect(fixture.nativeElement.textContent).toContain('Strong Buying Increasing');
    expect(fixture.nativeElement.textContent).toContain('Selling Increasing');
  });

  it('shades flat HIRO causally against the session so far', () => {
    const changes = [400, 380, 420, 390, 410, 400, 30, 500, 20, 450, 410, 40].map(v => v * 1_000_000);
    fixture.componentRef.setInput('rows', rows.map((row, index) => ({ ...row, spx_hiro_change_30m: changes[index] })));
    fixture.detectChanges();
    // Captures 7, 9 and 12 are under 35% of the median of earlier captures; the first six only build history.
    expect(flatHiroFlags(rows.map((row, index) => ({ ...row, spx_hiro_change_30m: changes[index] }))))
      .toEqual([false, false, false, false, false, false, true, false, true, false, false, true]);
    expect(fixture.nativeElement.querySelectorAll('.hiro-flat-band')).toHaveLength(3);
    expect(fixture.nativeElement.textContent).toContain('3 flat');
  });

  it('shows no flat bands for sessions without minute-level HIRO changes', () => {
    expect(fixture.nativeElement.querySelectorAll('.hiro-flat-band')).toHaveLength(0);
  });

  it('shows shared marked prices on the HIRO chart', () => {
    fixture.componentRef.setInput('priceLevels', [
      { id: 'level-1', price: 7420, label: 'Invalidation', color: '#fbbf24' },
    ]);
    fixture.detectChanges();
    const hiroChart = fixture.nativeElement.querySelector('.trend-svg--hiro') as SVGElement;
    expect(hiroChart.querySelectorAll('.marked-price-line')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Invalidation');
  });

  it('keeps the chart aligned to the selected capture', () => {
    const latestX = component.hiroChart.hiroActiveX;
    component.activeIndex = 4;
    component.ngOnChanges();
    fixture.detectChanges();
    expect(component.hiroChart.hiroActiveX).toBeLessThan(latestX);
    expect(fixture.nativeElement.querySelectorAll('.trend-svg--hiro .trend-marker')).toHaveLength(3);
  });

  it('clears chart geometry when a new session has too few captures', () => {
    expect(component.hiroChart.hiroYTicks.length).toBeGreaterThan(0);
    fixture.componentRef.setInput('rows', rows.slice(0, 1));
    fixture.detectChanges();
    expect(component.hiroChart.hiroHasData).toBe(false);
    expect(component.hiroChart.hiroYTicks).toEqual([]);
    expect(fixture.nativeElement.querySelectorAll('polyline')).toHaveLength(0);
  });

  it('highlights 750M capture changes as magnitude-only events', () => {
    fixture.componentRef.setInput('rows', rows.map((row, index) => index === rows.length - 1
      ? { ...row, spx_hiro: (row.spx_hiro ?? 0) + 1_000_000_000 }
      : row));
    fixture.detectChanges();

    expect(component.hiroChart.hiroJumpCount).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelectorAll('.hiro-jump-marker').length).toBeGreaterThan(0);
  });

  it('shows opposing-flow balance without turning it into a signal', () => {
    const balancedRows = rows.map((row, index) => index === rows.length - 1
      ? {
          ...row,
          spx_hiro: -1_000_000_000,
          equities_hiro: 900_000_000,
          pocket_sign: 'positive',
          hiro_relationship_class: 'opposing' as const,
          hiro_balance_score: 0.947,
          hiro_balance_bucket: 'high' as const,
          hiro_combined_abs_magnitude: 1_900_000_000,
          hiro_balance_scoring_effect: 'none' as const,
        }
      : row);
    fixture.componentRef.setInput('rows', balancedRows);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Opposing \u00b7 95% balanced');
    expect(fixture.nativeElement.textContent).toContain('1.90B combined');
    expect(fixture.nativeElement.textContent).toContain('Positive gamma');
    expect(fixture.nativeElement.querySelectorAll('.hiro-balance-marker')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('High opposing balance');

    const changeButton = Array.from<HTMLButtonElement>(
      fixture.nativeElement.querySelectorAll('.trend-segment button'),
    ).find(button => button.textContent?.trim() === 'Change');
    changeButton?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.hiro-balance-marker')).toHaveLength(0);
  });
});
