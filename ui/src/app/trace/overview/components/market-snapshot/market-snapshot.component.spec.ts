import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CharmOverview } from '../../../charm/charm.models';
import {
  TraceDashboardRow,
  TraceGammaContextRow,
  TraceHistogramRow,
  TraceRealizedVolatilityResponse,
} from '../../trace.models';
import { MarketSnapshotComponent } from './market-snapshot.component';

const rows = [
  { ts: '2026-07-24T12:50:04-07:00', capture_id: 'capture-1', spot: 7405 },
  {
    ts: '2026-07-24T13:00:05-07:00', capture_id: 'capture-2', spot: 7412,
    spx_hiro: -1_280_000_000, spx_hiro_rate_per_minute: 119_000_000,
    spx_hiro_source_age_seconds: 66, equities_hiro: -1_280_000_000,
    equities_hiro_rate_per_minute: -18_000_000, equities_hiro_source_age_seconds: 66,
    flow_state: 'spx_up_equities_down', flow_relationship: 'divergent', flow_spx_score: 2,
    flow_equities_score: -3, flow_spx_acceleration: 'strong_buying_increasing',
    flow_equities_acceleration: 'flat', flow_readiness_status: 'ready', put_wall: 7300,
    hedge_wall: 7510, call_wall: 7600, global_shelf_center: 7405, shelf_center_d: 3.5,
    shelf_direction: 'up', local_gamma_setup: 'neg_with_above', pocket_sign: 'negative',
  },
] as unknown as TraceDashboardRow[];

const gammaRows = [{
  date: '2026-07-24', ts: rows[1].ts, capture_id: 'capture-2', pocket_sign: 'negative',
  local_gamma_setup: 'neg_with_above', nearest_strike: 7410,
  nearest_total_gamma: -400_600_000, cross_spot_slope: 47_000_000,
}] as unknown as TraceGammaContextRow[];

const nodes = [
  { capture_id: 'capture-2', gamma_sign: 'positive', center_strike: 7405, state: 'STRENGTHENING', cluster_share: .994 },
  { capture_id: 'capture-2', gamma_sign: 'negative', center_strike: 7397, state: 'STRENGTHENING', cluster_share: .755 },
] as unknown as TraceHistogramRow[];

const volatility = {
  thresholds: { low_max_bps: 5.1129, mid_max_bps: 8.2959 },
  rows: [{ capture_id: 'capture-2', as_of: rows[1].ts, realized_vol_bps: 6.4, return_observations: 6, lookback_returns: 6, classification_status: 'ready', realized_vol_regime: 'mid_realized' }],
} as unknown as TraceRealizedVolatilityResponse;

const charm = {
  quality: { usable_percent: 94.6 },
  series: [{ capture_id: 'capture-2', charm_at_market: 327_000_000, nearest_flip: 7416.4, spot_minus_flip: -4.4, interval_minutes: 5, source_age_seconds: 305, close_window: true }],
} as unknown as CharmOverview;

describe('MarketSnapshotComponent', () => {
  let fixture: ComponentFixture<MarketSnapshotComponent>;
  let component: MarketSnapshotComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [MarketSnapshotComponent], imports: [CommonModule] }).compileComponents();
    fixture = TestBed.createComponent(MarketSnapshotComponent);
    component = fixture.componentInstance;
    component.rows = rows;
    component.activeIndex = 1;
    component.gammaContextRows = gammaRows;
    component.histogramNodes = nodes;
    component.realizedVolatility = volatility;
    component.charmOverview = charm;
    fixture.detectChanges();
  });

  it('restores the legacy snapshot evidence and makes spot movement prominent', () => {
    const text = fixture.nativeElement.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('Spot7412Last move +7');
    expect(text).toContain('rate +119.0M/min');
    expect(text).toContain('Spx Up Equities Down');
    expect(text).toContain('Expansion (−)');
    expect(text).toContain('at spot −400.6M');
    expect(text).toContain('Medium movement');
    expect(text).toContain('Low ≤ 5.1 bps');
    expect(text).toContain('hedge 98 pts away');
    expect(text).toContain('Charm at Market+327.0M');
    expect(text).toContain('1 positive · 1 negative');
    expect(fixture.nativeElement.querySelector('.snapshot-spot').textContent).toContain('7412');
    expect(fixture.nativeElement.querySelector('[data-card-tone="warning"]')).not.toBeNull();
  });
});
