import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';

import { PositionsPageComponent } from './positions-page.component';
import { PositionsApiService } from '../positions-api.service';
import { AccountPositions, PositionGroup, PositionsResponse } from '../positions.models';

class MockApi {
  response: PositionsResponse = { accounts: [] };
  getAll() {
    return of(this.response);
  }
}

describe('PositionsPageComponent', () => {
  let component: PositionsPageComponent;
  let fixture: ComponentFixture<PositionsPageComponent>;
  let api: MockApi;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PositionsPageComponent],
      providers: [{ provide: PositionsApiService, useClass: MockApi }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    }).compileComponents();

    api = TestBed.inject(PositionsApiService) as unknown as MockApi;
    fixture = TestBed.createComponent(PositionsPageComponent);
    component = fixture.componentInstance;
  });

  it('ngOnInit fetches accounts and applies rules', () => {
    const group: PositionGroup = {
      underlying_symbol: 'SPY',
      expires_at: '2025-01-15',
      total_credit_received: 10,
      current_group_p_l: 5,
      percent_credit_received: 55,
      total_delta: 0,
      positions: []
    };
    api.response = { accounts: [{ account_number: '1', groups: [group] }] };

    component.ngOnInit();

    expect(component.accounts.length).toBe(1);
    expect(component.accounts[0].groups[0].rules?.length).toBe(2);
  });

  it('getRuleClass returns expected class', () => {
    const group: PositionGroup = {
      underlying_symbol: '',
      expires_at: '',
      total_credit_received: 0,
      current_group_p_l: 0,
      percent_credit_received: null,
      total_delta: 0,
      positions: [],
      rules: [{ id: 'r1', label: 'warning', detail: 'detail', action: 'action', level: 'warning' }]
    };

    expect(component.getRuleClass(group)).toBe('warning');
    group.rules = [{ id: 'r2', label: 'alert', detail: 'detail', action: 'action', level: 'alert' }];
    expect(component.getRuleClass(group)).toBe('alert');
    group.rules = undefined;
    expect(component.getRuleClass(group)).toBe('');
  });
  it('labels buying-power zones and explains Greek concentration', () => {
    const account: AccountPositions = {
      account_number: '1',
      groups: [],
      buying_power_utilization_percent: 32,
      buying_power_zone: 'comfortable',
      largest_underlying_concentration: {
        underlying_symbol: 'SPY',
        delta_shares: 30,
        beta_delta_shares: 30,
        absolute_beta_delta_share_percent: 75,
        group_count: 1,
        exposure_basis: 'beta_delta_shares'
      }
    };

    expect(component.buyingPowerZoneLabel(account)).toBe('Comfortable');
    expect(component.buyingPowerTooltip(account)).toContain('low below 20%');
    expect(component.buyingPowerTooltip(account)).toContain('comfortable 20–40%');
    expect(component.buyingPowerTooltip(account)).toContain('elevated above 40%');
    expect(component.buyingPowerTooltip(account)).toContain('not brokerage rules');
    expect(component.concentrationTooltip(account)).toContain('not capital or notional concentration');
  });

  it('labels expirations compactly and counts calendar days to the nearest one', () => {
    const today = new Date(2026, 9, 16, 15, 0);
    const group = { underlying_symbol: 'SPY', expires_at: '2026-11-20', total_credit_received: 0, current_group_p_l: 0,
      percent_credit_received: null, positions: [] } as PositionGroup;
    expect(component.expirationLabel(group, today)).toBe(new Date(2026, 10, 20).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    expect(component.daysToExpiry(group, today)).toBe(35);
    expect(component.daysToExpiry({ ...group, expiration_dates: ['2026-12-18', '2026-10-16'] }, today)).toBe(0);
    expect(component.expirationLabel({ ...group, expires_at: '2027-01-15' }, today)).toContain('2027');
    expect(component.daysToExpiry({ ...group, expires_at: '' }, today)).toBeNull();
  });

  it('totals accounts without counting a missing value as zero', () => {
    component.accounts = [
      { account_number: '1', groups: [], net_liquidating_value_dollars: 100, theta_dollars_per_day: 5, delta_shares: 2 },
      { account_number: '2', groups: [], net_liquidating_value_dollars: 50, theta_dollars_per_day: null, total_theta: 3 },
    ] as AccountPositions[];
    const totals = Object.fromEntries(component.portfolioTotals.map(total => [total.label, total]));
    expect(totals['Net liquidity']).toMatchObject({ value: 150, partial: false, currency: true });
    expect(totals['Theta / day']).toMatchObject({ value: 8, partial: false });
    expect(totals['Delta shares']).toMatchObject({ value: 2, partial: true, currency: false });
    expect(totals['Available BP']).toMatchObject({ value: null, partial: true });
  });

  it('expands a group into a detail row and opening its chart expands it too', () => {
    const group = { underlying_symbol: 'SPY', expires_at: '2026-11-20', total_credit_received: 0, current_group_p_l: 0,
      percent_credit_received: null, positions: [] } as PositionGroup;
    const account = { account_number: '1', groups: [group] } as AccountPositions;
    expect(component.isDetailRow(0, group)).toBe(false);
    component.toggleExpanded(group);
    expect(component.isExpanded(group) && component.isDetailRow(0, group)).toBe(true);
    component.toggleExpanded(group);
    expect(component.isExpanded(group)).toBe(false);
    component.onUnderlyingClick(group, new Event('click'), account);
    expect(component.isChartExpanded(group, account) && component.isExpanded(group)).toBe(true);
  });
});
