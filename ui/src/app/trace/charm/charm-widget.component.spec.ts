import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Subject, of } from 'rxjs';

import { SharedMaterialModule } from '../../shared/material.module';
import { CharmApiService } from './charm-api.service';
import { CharmOverview, CharmSeriesPoint, CharmSurface } from './charm.models';
import { CharmWidgetComponent } from './charm-widget.component';

const point: CharmSeriesPoint = {
  ts: '2026-07-24T13:00:05-07:00', capture_id: 'capture-2', spot: 7412,
  surface_spot: 7412, charm_at_market: 237_000_000, nearest_flip: 7416.4,
  spot_minus_flip: -4.4, snapshot_ts: '2026-07-24T12:59:00-07:00',
  model_ts: '2026-07-24T12:55:00-07:00', next_model_ts: '2026-07-24T13:00:00-07:00',
  interval_minutes: 5, source_age_seconds: 300, close_window: false,
};
const overview = {
  date: '2026-07-24', latest: point, series: [point],
  quality: { usable_percent: 94.6, status: 'ready', usable_capture_count: 1, capture_count: 1 },
  distribution: { sign_transitions: 0, min: 237_000_000, max: 237_000_000 },
} as CharmOverview;
const surface = {
  ts: point.ts, spot: point.spot, nearest_flip: point.nearest_flip, robust_abs_p95: 100,
  source: { close_window: false },
  rows: [{ spot: 7400, charm_per_minute: -10 }, { spot: 7420, charm_per_minute: 10 }],
} as CharmSurface;

class CharmApiStub {
  readonly surface = vi.fn(() => of(surface));
}

describe('CharmWidgetComponent', () => {
  let fixture: ComponentFixture<CharmWidgetComponent>;
  let component: CharmWidgetComponent;
  let api: CharmApiStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CharmWidgetComponent],
      imports: [CommonModule, FormsModule, SharedMaterialModule, NoopAnimationsModule],
      providers: [{ provide: CharmApiService, useClass: CharmApiStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(CharmWidgetComponent);
    component = fixture.componentInstance;
    api = TestBed.inject(CharmApiService) as unknown as CharmApiStub;
    fixture.componentRef.setInput('date', '2026-07-24');
    fixture.componentRef.setInput('captureTs', point.ts);
    fixture.componentRef.setInput('overview', overview);
    fixture.detectChanges();
  });

  it('renders the selected session context and matching Charm surface inline', () => {
    expect(api.surface).toHaveBeenLastCalledWith('2026-07-24', point.ts, 60);
    expect(fixture.nativeElement.textContent).toContain('Charm pressure');
    expect(fixture.nativeElement.textContent).toContain('+237.00M');
    expect(fixture.nativeElement.querySelectorAll('.chart-card')).toHaveLength(2);
  });

  it('notifies Angular when an asynchronous surface request finishes', () => {
    const response = new Subject<CharmSurface>();
    api.surface.mockReturnValueOnce(response);
    const markForCheck = vi.spyOn((component as any).changeDetector, 'markForCheck');

    component.loadSurface();
    expect(component.surfaceLoading).toBe(true);
    response.next(surface);

    expect(component.surfaceLoading).toBe(false);
    expect(component.surface).toBe(surface);
    expect(markForCheck).toHaveBeenCalledOnce();
  });

  it('emits a TRACE capture timestamp when a history point is selected', () => {
    const emitted = vi.fn();
    component.captureSelected.subscribe(emitted);
    component.selectPoint(point);

    expect(emitted).toHaveBeenCalledWith(point.ts);
  });
});
