import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { SharedMaterialModule } from '../../../../shared/material.module';
import { TraceApiService } from '../../data-access/trace-api.service';
import { StrategyPostureResponse } from './strategy-posture.models';
import { StrategyPostureComponent } from './strategy-posture.component';


const READY_RESPONSE: StrategyPostureResponse = {
  schema_version: 'spx-0dte-strategy-posture-shadow.v1',
  status: 'ready',
  classification_status: 'ready',
  date: '2026-08-31',
  generated_at: '2026-08-31T15:01:00Z',
  as_of: '2026-08-31T08:00:00-07:00',
  capture_id: 'c1',
  prior_capture_id: 'c0',
  selection: 'exact',
  posture: 'bull_put_credit_watch',
  direction: 'bull_put',
  reason_codes: ['positive_gamma', 'bull_put_hiro', 'prior_structure_confirmed'],
  frozen_structure: { type: 'local_support', level: 7490, distance_points_at_freeze: 10 },
  protocol: {
    id: 'spx-0dte-strategy-posture-v1',
    status: 'preregistered',
    frozen_on: '2026-08-30',
    prospective_start_date: '2026-08-31',
    automatic_scoring: false,
  },
  research: {
    study_id: 'spx-0dte-strategy-posture',
    status: 'preregistered',
    scoring_enabled: false,
    mode: 'shadow',
  },
  provenance: {
    date: '2026-08-31',
    capture_id: 'c1',
    capture_ts: '2026-08-31T08:00:00-07:00',
    prior_capture_id: 'c0',
    prior_capture_ts: '2026-08-31T07:50:00-07:00',
  },
  observations: {
    spot: 7501,
    pocket_sign: 'positive',
    spx_hiro: 100,
    spx_hiro_delta: 10,
    equities_hiro: 50,
    equities_hiro_delta: 5,
  },
  warnings: ['research_only', 'scoring_disabled'],
};


class TraceApiStub {
  readonly strategyPosture = vi.fn(() => of(READY_RESPONSE));
}


describe('StrategyPostureComponent', () => {
  let fixture: ComponentFixture<StrategyPostureComponent>;
  let api: TraceApiStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StrategyPostureComponent],
      imports: [CommonModule, SharedMaterialModule, NoopAnimationsModule],
      providers: [{ provide: TraceApiService, useClass: TraceApiStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(StrategyPostureComponent);
    api = TestBed.inject(TraceApiService) as unknown as TraceApiStub;
  });

  it('renders a non-scoring shadow posture beside the personal baseline', () => {
    fixture.componentRef.setInput('date', '2026-08-31');
    fixture.componentRef.setInput('captureTs', '2026-08-31T08:00:00-07:00');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(api.strategyPosture).toHaveBeenCalledWith('2026-08-31', '2026-08-31T08:00:00-07:00');
    expect(text).toContain('Bull put credit watch');
    expect(text).toContain('Compare with the unchanged personal watch');
    expect(text).toContain('preregistered');
    expect(text).toContain('Scoring');
    expect(text).toContain('Disabled');
    expect(text).toContain('does not replace the personal watch');
  });

  it('renders stand aside as an observed posture', () => {
    api.strategyPosture.mockReturnValue(of({
      ...READY_RESPONSE,
      posture: 'stand_aside',
      direction: null,
      frozen_structure: null,
      reason_codes: ['no_directional_hiro'],
    }));
    fixture.componentRef.setInput('date', '2026-08-31');
    fixture.componentRef.setInput('captureTs', '2026-08-31T08:10:00-07:00');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Stand aside');
    expect(fixture.nativeElement.textContent).toContain('no directional hiro');
  });

  it('renders out-of-window captures as ineligible without inventing a posture', () => {
    api.strategyPosture.mockReturnValue(of({
      ...READY_RESPONSE,
      status: 'ineligible',
      classification_status: 'ineligible',
      posture: null,
      direction: null,
      frozen_structure: null,
      reason_codes: ['outside_research_window'],
    }));
    fixture.componentRef.setInput('date', '2026-08-31');
    fixture.componentRef.setInput('captureTs', '2026-08-31T10:00:00-07:00');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('ineligible');
    expect(text).toContain('No posture available');
    expect(text).toContain('outside research window');
  });

  it('renders unavailable separately from stand aside', () => {
    api.strategyPosture.mockReturnValue(of({
      ...READY_RESPONSE,
      status: 'unavailable',
      classification_status: 'unavailable',
      posture: null,
      direction: null,
      frozen_structure: null,
      reason_codes: ['missing_prior_capture'],
    }));
    fixture.componentRef.setInput('date', '2026-09-01');
    fixture.componentRef.setInput('captureTs', '2026-09-01T08:00:00-07:00');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('unavailable');
    expect(text).toContain('No posture available');
    expect(text).toContain('missing prior capture');
    expect(text).not.toContain('Stand aside');
  });

  it('blocks presentation if scoring is unexpectedly enabled', () => {
    api.strategyPosture.mockReturnValue(of({
      ...READY_RESPONSE,
      research: { ...READY_RESPONSE.research, scoring_enabled: true },
    }));
    fixture.componentRef.setInput('date', '2026-08-31');
    fixture.componentRef.setInput('captureTs', '2026-08-31T08:00:00-07:00');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('blocked because scoring is unexpectedly enabled');
    expect(fixture.nativeElement.textContent).not.toContain('Bull put credit watch');
  });
});
