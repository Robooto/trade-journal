import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../../../shared/material.module';
import {
  TraceDashboardRow,
  TraceHistogramRow,
} from '../../trace.models';
import { SignedGexMapComponent } from './signed-gex-map.component';

const rows: TraceDashboardRow[] = [
  {
    ts: '2026-07-24T12:50:04-07:00',
    capture_id: 'capture-1',
    spot: 7410,
  } as TraceDashboardRow,
  {
    ts: '2026-07-24T13:00:05-07:00',
    capture_id: 'capture-2',
    spot: 7412,
  } as TraceDashboardRow,
];

const nodes: TraceHistogramRow[] = [
  {
    ts: rows[1].ts,
    capture_id: rows[1].capture_id,
    timestamp: rows[1].ts,
    gamma_sign: 'positive',
    center_strike: 7420,
    state: 'STRENGTHENING',
    cluster_share: 0.48,
    share_d: 0.02,
    center_d_points: 2,
    cluster_width: 10,
    spot: 7412,
    put_wall: 7300,
    hedge_wall: 7410,
    call_wall: 7500,
  },
  {
    ts: rows[1].ts,
    capture_id: rows[1].capture_id,
    timestamp: rows[1].ts,
    gamma_sign: 'negative',
    center_strike: 7400,
    state: 'MIGRATING',
    cluster_share: 0.34,
    share_d: -0.01,
    center_d_points: -12,
    cluster_width: 10,
    spot: 7412,
    put_wall: 7300,
    hedge_wall: 7410,
    call_wall: 7500,
  },
];


describe('SignedGexMapComponent', () => {
  let fixture: ComponentFixture<SignedGexMapComponent>;
  let component: SignedGexMapComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SignedGexMapComponent],
      imports: [CommonModule, SharedMaterialModule, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(SignedGexMapComponent);
    component = fixture.componentInstance;
    component.rows = rows;
    component.nodes = nodes;
    component.activeIndex = 1;
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders positive and negative nodes for the selected capture', () => {
    expect(fixture.nativeElement.textContent).toContain('Signed GEX structure map');
    expect(fixture.nativeElement.querySelector('circle.gex-node--positive')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('path.gex-node--negative')).not.toBeNull();
  });

  it('keeps the chart responsive without introducing a minimum canvas width', () => {
    const map = fixture.nativeElement.querySelector('svg.gex-map');
    expect(map.getAttribute('viewBox')).toBe('0 0 1200 440');
    expect(map.getAttribute('width')).toBeNull();
  });

  it('renders shared marked levels on the strike axis', () => {
    fixture.componentRef.setInput('priceLevels', [
      { id: 'level-1', price: 7415, label: 'Decision level', color: '#fbbf24' },
    ]);
    fixture.detectChanges();

    const chart = fixture.nativeElement.querySelector('.gex-map') as SVGElement;
    const levelLayer = chart.querySelector('.marked-price-layer') as SVGElement;
    const node = chart.querySelector('.gex-node--positive') as SVGElement;

    expect(chart.querySelectorAll('.marked-price-line')).toHaveLength(1);
    expect(chart.querySelectorAll('.marked-price-line-halo')).toHaveLength(1);
    expect(Array.from(chart.children).indexOf(levelLayer))
      .toBeGreaterThan(Array.from(chart.children).indexOf(node));
    expect(fixture.nativeElement.textContent).toContain('Decision level');
  });

  it('plots one frame per capture, sized by absolute gamma and colored by 30-minute growth', () => {
    const base = nodes[0];
    fixture.componentRef.setInput('nodes', [
      { ...base, timestamp: '2026-07-24T12:49:00-07:00', latest_frame: false, center_strike: 7419, node_gamma: 1e9 },
      { ...base, latest_frame: true, node_gamma: 4e9, node_gamma_10m_ago: 3e9, node_gamma_30m_ago: 2e9 },
      { ...base, latest_frame: true, gamma_sign: 'negative', center_strike: 7405, node_gamma: -1e9, node_gamma_30m_ago: -2e9 },
    ]);
    fixture.detectChanges();
    const chart = fixture.nativeElement.querySelector('.gex-map') as SVGElement;
    expect(chart.querySelectorAll('.gex-node')).toHaveLength(2);
    const growing = chart.querySelector('.gex-node--positive') as SVGCircleElement;
    const shrinking = chart.querySelector('.gex-node--negative') as SVGPathElement;
    expect(growing.getAttribute('class')).toContain('gex-trend--growing');
    expect(shrinking.getAttribute('class')).toContain('gex-trend--shrinking');
    expect(Number(growing.getAttribute('r'))).toBeCloseTo(13.5, 1);
    expect(growing.querySelector('title')?.textContent).toContain('30m +100%');
    expect(fixture.nativeElement.textContent).toContain('Growing +100% / 30m');
  });

  it('draws walls and shelf from the capture rows', () => {
    fixture.componentRef.setInput('rows', rows.map(row => ({ ...row, put_wall: 7300, call_wall: 7500, hedge_wall: 7410, global_shelf_center: 7405 })));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.gex-level')).toHaveLength(4);
  });
});
