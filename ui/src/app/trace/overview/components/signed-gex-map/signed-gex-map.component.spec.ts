import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../../../shared/material.module';
import {
  TraceDashboardRow,
  TraceGammaProfileResponse,
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

const gammaProfile: TraceGammaProfileResponse = {
  schema_version: 'trace-gamma-profile.v1',
  status: 'ready',
  date: '2026-07-24',
  generated_at: '2026-07-25T18:00:00Z',
  freshness: {
    generated_at: '2026-07-25T18:00:00Z',
    latest_capture_ts: rows[1].ts,
    session_relation: 'historical',
    latest_capture_age_seconds: null,
  },
  data_quality: {
    status: 'ready',
    row_count: 3,
    required_fields: ['spot', 'gamma'],
    missing_required_values: {},
    duplicate_capture_ids: 0,
    warnings: [],
  },
  warnings: [],
  ts: rows[1].ts,
  capture_id: rows[1].capture_id,
  spot: 7412,
  window_points: 60,
  cross_spot_slope: 47_042_808,
  source: { mode: 'fixture', timestamp: null, time: null },
  rows: [
    { spot: 7400, gamma: -120_000_000 },
    { spot: 7412, gamma: 25_000_000 },
    { spot: 7420, gamma: 140_000_000 },
  ],
};

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
    component.gammaProfile = gammaProfile;
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders positive and negative nodes with the selected capture gamma profile', () => {
    expect(fixture.nativeElement.textContent).toContain('Signed GEX structure map');
    expect(fixture.nativeElement.querySelector('circle.gex-node--positive')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('path.gex-node--negative')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('polyline.profile-line')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('47.0M/pt');
  });

  it('keeps the chart responsive without introducing a minimum canvas width', () => {
    const map = fixture.nativeElement.querySelector('svg.gex-map');
    expect(map.getAttribute('viewBox')).toBe('0 0 1200 440');
    expect(map.getAttribute('width')).toBeNull();
  });
});