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
});
