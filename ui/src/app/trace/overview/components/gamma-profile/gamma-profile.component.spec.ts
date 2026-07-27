import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../../../shared/material.module';
import { TraceGammaProfileResponse } from '../../trace.models';
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
    component.ngOnChanges();
    fixture.detectChanges();
  });

  it('renders signed bars and the profile line for the selected capture', () => {
    expect(fixture.nativeElement.textContent).toContain('Gamma Profile');
    expect(fixture.nativeElement.querySelector('polyline.profile-line')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('rect.profile-bar--positive')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('rect.profile-bar--negative')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('47.0M/pt');
    expect(fixture.nativeElement.textContent).toContain('At spot');
    expect(fixture.nativeElement.textContent).toContain('25.0M');
    expect(fixture.nativeElement.textContent).toContain('nearest 7,412');
    expect(fixture.nativeElement.textContent).toContain('Positive');
    expect(fixture.nativeElement.textContent).toContain('Rising');
    expect(fixture.nativeElement.textContent).toContain('Feature snapshot');
    expect(fixture.nativeElement.querySelectorAll('text.profile-zone-label')).toHaveLength(2);
  });
});
