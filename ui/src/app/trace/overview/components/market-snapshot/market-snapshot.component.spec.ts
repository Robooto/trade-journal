import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraceDashboardRow, TraceRealizedVolatilityResponse } from '../../trace.models';
import { MarketSnapshotComponent } from './market-snapshot.component';

const rows = [
  { ts: '2026-07-24T12:50:04-07:00', capture_id: 'capture-1', spot: 7405 },
  {
    ts: '2026-07-24T13:00:05-07:00', capture_id: 'capture-2', spot: 7412,
    spx_hiro: -1_280_000_000, flow_state: 'spx_up_equities_down', put_wall: 7300,
    hedge_wall: 7510, call_wall: 7600, global_shelf_center: 7405, shelf_center_d: 3.5,
    structure_support_type: 'local_support', structure_support_level: 7404, structure_support_distance: 8,
    structure_resistance_type: 'call_wall', structure_resistance_level: 7427, structure_resistance_distance: 15,
    shelf_direction: 'up', local_gamma_setup: 'neg_with_above', pocket_sign: 'negative',
  },
] as unknown as TraceDashboardRow[];

const volatility = {
  thresholds: { low_max_bps: 5.1129, mid_max_bps: 8.2959 },
  rows: [{ capture_id: 'capture-2', as_of: rows[1].ts, realized_vol_bps: 9.4, return_observations: 6, lookback_returns: 6, classification_status: 'ready', realized_vol_regime: 'high_realized' }],
} as unknown as TraceRealizedVolatilityResponse;

describe('MarketSnapshotComponent', () => {
  let fixture: ComponentFixture<MarketSnapshotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [MarketSnapshotComponent], imports: [CommonModule] }).compileComponents();
    fixture = TestBed.createComponent(MarketSnapshotComponent);
    const component = fixture.componentInstance;
    component.rows = rows;
    component.activeIndex = 1;
    component.realizedVolatility = volatility;
    fixture.detectChanges();
  });

  it('shows one compact row: spot, gamma, support, resistance, walls, shelf and movement', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('.snapshot-card') as NodeListOf<HTMLElement>)
      .map(card => Array.from(card.children).map(child => child.textContent?.replace(/\s+/g, ' ').trim()).join(' | '));
    expect(cards).toEqual([
      'Spot | 7412 | last move +7',
      'Gamma | Negative | expansion context',
      'Support | 7404 | Local Support · 8 pts',
      'Resistance | 7427 | Call Wall · 15 pts',
      'Walls put / hedge / call | 7300 / 7510 / 7600 | hedge 98 pts away',
      'Shelf | 7405 | Up +3.5',
      'Movement | High | 9.4 bps realized · context only',
    ]);
    expect(fixture.nativeElement.querySelector('[data-card-tone="warning"]')).not.toBeNull();
  });

  it('leaves HIRO and nodes to their own panels', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).not.toContain('HIRO');
    expect(text).not.toContain('Spx Up Equities Down');
    expect(text).not.toContain('GEX');
    expect(fixture.nativeElement.querySelector('.candidate-evidence')).toBeNull();
  });
});
