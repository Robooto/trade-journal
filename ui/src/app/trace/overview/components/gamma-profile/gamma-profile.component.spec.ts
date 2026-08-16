import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../../../shared/material.module';
import { TraceGammaContextRow, TraceGammaProfileResponse } from '../../trace.models';
import { GammaProfileComponent } from './gamma-profile.component';

const gammaProfile: TraceGammaProfileResponse = {
  schema_version: 'trace-gamma-profile.v1',
  status: 'ready',
  date: '2026-07-24',
  generated_at: '2026-07-25T18:00:00Z',
  freshness: { generated_at: '2026-07-25T18:00:00Z', latest_capture_ts: '2026-07-24T13:00:05-07:00', session_relation: 'historical', latest_capture_age_seconds: null },
  data_quality: { status: 'ready', row_count: 3, required_fields: ['spot', 'gamma'], missing_required_values: {}, duplicate_capture_ids: 0, warnings: [] },
  warnings: [],
  ts: '2026-07-24T13:00:05-07:00',
  capture_id: 'capture-2',
  spot: 7412,
  window_points: 60,
  cross_spot_slope: 47_042_808,
  source: { mode: 'feature_snap', timestamp: null, time: null },
  rows: [
    { spot: 7400, gamma: -120_000_000 },
    { spot: 7412, gamma: 25_000_000 },
    { spot: 7420, gamma: 140_000_000 },
  ],
};

const gammaHistory: TraceGammaContextRow[] = [
  { date: '2026-07-24', ts: '2026-07-24T12:40:05-07:00', capture_id: 'capture-1', pocket_sign: 'negative', local_gamma_setup: 'negative', nearest_strike: 7400, nearest_total_gamma: -120_000_000, cross_spot_slope: -8_000_000 },
  { date: '2026-07-24', ts: '2026-07-24T13:00:05-07:00', capture_id: 'capture-2', pocket_sign: 'positive', local_gamma_setup: 'positive', nearest_strike: 7412, nearest_total_gamma: 25_000_000, cross_spot_slope: 47_042_808 },
  { date: '2026-07-24', ts: '2026-07-24T13:20:05-07:00', capture_id: 'capture-3', pocket_sign: 'positive', local_gamma_setup: 'positive', nearest_strike: 7420, nearest_total_gamma: 140_000_000, cross_spot_slope: 51_000_000 },
];

describe('GammaProfileComponent', () => {
  let fixture: ComponentFixture<GammaProfileComponent>;
  let component: GammaProfileComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GammaProfileComponent],
      imports: [CommonModule, SharedMaterialModule, NoopAnimationsModule],
    }).compileComponents();
    fixture = TestBed.createComponent(GammaProfileComponent);
    component = fixture.componentInstance;
    component.gammaProfile = gammaProfile;
    component.gammaContextRows = gammaHistory;
    component.captureTs = gammaProfile.ts;
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders intraday gamma history beside the selected capture profile', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Gamma Profile');
    expect(text).toContain('Gamma at spot');
    expect(text).toContain('3 captures');
    expect(text).toContain('1 gamma sign transitions');
    expect(fixture.nativeElement.querySelector('path.history-line')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.history-chart-wrap circle')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.history-chart-wrap circle.selected')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('polyline.profile-line')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('rect.profile-bar--positive')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('rect.profile-bar--negative')).not.toBeNull();
    expect(text).toContain('47.0M/pt');
    expect(text).toContain('25.0M');
    expect(text).toContain('nearest 7,412');
    expect(text).toContain('Rising');
  });

  it('selects a TRACE capture from an intraday history point', () => {
    let selected = '';
    component.captureSelected.subscribe(value => selected = value);

    fixture.nativeElement.querySelector('.history-chart-wrap circle').dispatchEvent(new MouseEvent('click'));

    expect(selected).toBe(gammaHistory[0].ts);
  });
});
