import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraceDashboardRow, TraceHistogramRow } from '../../trace.models';
import { SessionTrendsComponent } from './session-trends.component';

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

  it('renders the five price-structure series and three HIRO/spot series', () => {
    expect(fixture.nativeElement.textContent).toContain('Price, walls, and shelf');
    expect(fixture.nativeElement.textContent).toContain('HIRO pressure');
    expect(fixture.nativeElement.querySelectorAll('.trend-svg--price polyline')).toHaveLength(5);
    expect(fixture.nativeElement.querySelectorAll('.trend-svg--hiro polyline')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.trend-line--spx-hiro')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.trend-line--equities-hiro')).not.toBeNull();
  });

  it('shows signed GEX containment/expansion nodes and HIRO rate direction', () => {
    expect(fixture.nativeElement.textContent).toContain('Containment +');
    expect(fixture.nativeElement.textContent).toContain('Expansion −');
    expect(fixture.nativeElement.querySelectorAll('.structure-node--positive')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.structure-node--negative')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.hiro-direction-marker')).toHaveLength(24);
    expect(fixture.nativeElement.querySelectorAll('.hiro-direction-marker--up')).toHaveLength(12);
    expect(fixture.nativeElement.querySelectorAll('.hiro-direction-marker--down')).toHaveLength(12);
    expect(fixture.nativeElement.textContent).toContain('Strong Buying Increasing');
    expect(fixture.nativeElement.textContent).toContain('Selling Increasing');
  });

  it('keeps both responsive charts aligned to the selected capture', () => {
    const latestX = component.priceActiveX;
    component.activeIndex = 4;
    component.ngOnChanges();
    fixture.detectChanges();

    expect(component.priceActiveX).toBeLessThan(latestX);
    expect(component.hiroActiveX).toBe(component.priceActiveX);
    expect(fixture.nativeElement.querySelector('.trend-svg--price').getAttribute('width')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.trend-svg--price .trend-marker')).toHaveLength(5);
    expect(fixture.nativeElement.querySelectorAll('.trend-svg--hiro .trend-marker')).toHaveLength(3);
  });

  it('changes only the price scale when full range is selected', () => {
    const nearLabels = component.priceYTicks.map(tick => tick.label);
    component.setPriceWindowMode('full');
    const fullLabels = component.priceYTicks.map(tick => tick.label);

    expect(component.priceWindowMode).toBe('full');
    expect(fullLabels).not.toEqual(nearLabels);
    expect(component.hiroHasData).toBe(true);
  });
});