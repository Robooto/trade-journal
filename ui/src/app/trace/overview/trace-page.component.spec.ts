import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../shared/material.module';
import { CharmApiService } from '../charm/charm-api.service';
import { CharmWidgetComponent } from '../charm/charm-widget.component';
import { CaptureHistoryComponent } from './components/capture-history/capture-history.component';
import { GammaProfileComponent } from './components/gamma-profile/gamma-profile.component';
import { MarketSnapshotComponent } from './components/market-snapshot/market-snapshot.component';
import { SessionTrendsComponent } from './components/session-trends/session-trends.component';
import { SignedGexMapComponent } from './components/signed-gex-map/signed-gex-map.component';
import { TraceFacade } from './data-access/trace.facade';
import { TracePageComponent } from './trace-page.component';

class CharmApiStub {
  readonly surface = vi.fn(() => of({
    ts: '2026-07-24T13:00:05-07:00',
    spot: 7412,
    nearest_flip: 7410,
    robust_abs_p95: 100,
    source: { close_window: false },
    rows: [{ spot: 7400, charm_per_minute: -10 }, { spot: 7420, charm_per_minute: 10 }],
  }));
}
class TraceFacadeStub {
  readonly sessions = signal([]);
  readonly sessionsLoading = signal(false);
  readonly sessionsError = signal<string | null>(null);
  readonly selectedDate = signal('');
  readonly selectedSession = signal(null);
  readonly sessionLoading = signal(false);
  readonly sessionError = signal<string | null>(null);
  readonly bundle = signal(null);
  readonly captureRows = signal<any[]>([]);
  readonly selectedCaptureIndex = signal(0);
  readonly selectedCapture = signal<any>(null);
  readonly selectedRealizedVolatility = signal<any>(null);
  readonly gammaProfile = signal<any>(null);
  readonly gammaProfileLoading = signal(false);
  readonly gammaProfileError = signal<string | null>(null);
  readonly charmOverview = signal<any>(null);
  readonly charmLoading = signal(false);
  readonly charmError = signal<string | null>(null);
  readonly resourceStatuses = signal([]);
  readonly availableResourceCount = signal(0);
  readonly loadSessions = vi.fn();
  readonly selectDate = vi.fn();
  readonly selectCapture = vi.fn();
  readonly stepCapture = vi.fn();
  readonly reload = vi.fn();
}

describe('TracePageComponent', () => {
  let fixture: ComponentFixture<TracePageComponent>;
  let facade: TraceFacadeStub;

  beforeEach(async () => {
    facade = new TraceFacadeStub();
    await TestBed.configureTestingModule({
      declarations: [TracePageComponent, CaptureHistoryComponent, GammaProfileComponent, MarketSnapshotComponent, SessionTrendsComponent, SignedGexMapComponent, CharmWidgetComponent],
      imports: [
        CommonModule,
        FormsModule,
        SharedMaterialModule,
        NoopAnimationsModule,
      ],
      providers: [{ provide: TraceFacade, useValue: facade }, { provide: CharmApiService, useClass: CharmApiStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(TracePageComponent);
    fixture.detectChanges();
  });

  it('loads one operational dashboard without migration scaffolding', () => {
    expect(facade.loadSessions).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Charm pressure');
    expect(fixture.nativeElement.textContent).not.toContain('Source readiness');
    expect(fixture.nativeElement.textContent).not.toContain('Thin frontend boundary');
    expect(fixture.nativeElement.textContent).not.toContain('Migration foundation');
  });

  it('selects only dates present in the TRACE session catalog', () => {
    (facade.sessions as any).set([
      { date: '2026-07-23', status: 'ready' },
      { date: '2026-07-24', status: 'ready' },
    ]);
    facade.selectedDate.set('2026-07-24');
    fixture.detectChanges();

    const selectedDate = fixture.componentInstance.selectedSessionDate();
    expect(fixture.componentInstance.selectedSessionDate()).toBe(selectedDate);
    expect(selectedDate?.getFullYear()).toBe(2026);
    expect(selectedDate?.getMonth()).toBe(6);
    expect(selectedDate?.getDate()).toBe(24);
    expect(fixture.nativeElement.querySelector('mat-datepicker-toggle')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.trace-control-panel select')).toBeNull();
    expect(fixture.componentInstance.sessionDateFilter(new Date(2026, 6, 24))).toBe(true);
    expect(fixture.componentInstance.sessionDateFilter(new Date(2026, 6, 22))).toBe(false);

    fixture.componentInstance.selectSessionDate(new Date(2026, 6, 23));
    expect(facade.selectDate).toHaveBeenCalledWith('2026-07-23');
  });

  it('renders the selected capture as a glanceable market snapshot', () => {
    const capture = {
      ts: '2026-07-24T13:00:05-07:00',
      capture_id: 'capture-2',
      spot: 7412,
      spx_hiro: -1_280_000_000,
      spx_hiro_rate_per_minute: 119_000_000,
      equities_hiro: -1_280_000_000,
      equities_hiro_rate_per_minute: -18_000_000,
      flow_relationship: 'divergent',
      flow_state: 'spx_up_equities_down',
      put_wall: 7300,
      hedge_wall: 7510,
      call_wall: 7600,
      global_shelf_center: 7404.8,
      shelf_direction: 'up',
      shelf_center_d: 3.5,
      local_gamma_setup: 'neg_with_above',
      pocket_sign: 'negative',
    };
    facade.captureRows.set([capture]);
    facade.selectedCapture.set(capture);
    facade.selectedRealizedVolatility.set({
      realized_vol_regime: 'mid_realized',
      realized_vol_bps: 6.4,
      return_observations: 6,
    });    (facade.bundle as any).set({
      histogram: { rows: [] },
      gammaContext: { rows: [] },
      realizedVolatility: {
        thresholds: { low_max_bps: 5.1, mid_max_bps: 8.3 },
        rows: [{
          capture_id: 'capture-2',
          as_of: capture.ts,
          realized_vol_regime: 'mid_realized',
          classification_status: 'ready',
          realized_vol_bps: 6.4,
          return_observations: 6,
          lookback_returns: 6,
        }],
      },
    });

    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Session timeline');
    expect(fixture.nativeElement.textContent).toContain('Market snapshot');
    expect(fixture.nativeElement.textContent).toContain('−1.28B');
    expect(fixture.nativeElement.textContent).toContain('Medium movement');
  });

  it('moves through captures with unmodified left and right arrow keys', () => {
    facade.captureRows.set([{ capture_id: 'capture-1' }, { capture_id: 'capture-2' }]);

    const left = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(left);
    const right = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(right);

    expect(facade.stepCapture).toHaveBeenNthCalledWith(1, -1);
    expect(facade.stepCapture).toHaveBeenNthCalledWith(2, 1);
    expect(left.defaultPrevented).toBe(true);
    expect(right.defaultPrevented).toBe(true);
  });

  it('preserves arrow-key behavior inside controls and for modified shortcuts', () => {
    facade.captureRows.set([{ capture_id: 'capture-1' }]);
    const input = document.createElement('input');
    fixture.nativeElement.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }));
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(facade.stepCapture).not.toHaveBeenCalled();
  });

  it('delegates session, timeline, and Charm capture changes to the facade', () => {
    facade.captureRows.set([{ ts: 'first' }, { ts: 'selected' }]);
    (facade.sessions as any).set([{ date: '2026-07-24', status: 'ready' }]);
    fixture.componentInstance.selectSessionDate(new Date(2026, 6, 24));
    fixture.componentInstance.selectCapture('4');
    fixture.componentInstance.selectCaptureTimestamp('selected');

    expect(facade.selectDate).toHaveBeenCalledWith('2026-07-24');
    expect(facade.selectCapture).toHaveBeenNthCalledWith(1, 4);
    expect(facade.selectCapture).toHaveBeenNthCalledWith(2, 1);
  });

  it('keeps charts in the same sequence as the legacy TRACE dashboard', () => {
    const capture = {
      ts: '2026-07-24T13:00:05-07:00',
      capture_id: 'capture-2',
      spot: 7412,
      spx_hiro: 1,
      equities_hiro: -1,
      put_wall: 7300,
      hedge_wall: 7410,
      call_wall: 7500,
      global_shelf_center: 7405,
    };
    facade.captureRows.set([capture]);
    facade.selectedCapture.set(capture);
    (facade.bundle as any).set({ histogram: { rows: [] } });

    fixture.detectChanges();

    const order = Array.from(fixture.nativeElement.querySelectorAll(
      'app-signed-gex-map, app-trace-session-trends, app-trace-gamma-profile, app-charm-widget, app-trace-capture-history',
    )).map((element: any) => element.tagName.toLowerCase());
    expect(order).toEqual([
      'app-signed-gex-map',
      'app-trace-session-trends',
      'app-trace-gamma-profile',
      'app-charm-widget',
      'app-trace-capture-history',
    ]);
  });
});
