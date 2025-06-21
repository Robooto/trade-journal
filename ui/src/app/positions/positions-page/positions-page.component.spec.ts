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
      rules: [{ id: 'r1', level: 'warning' }]
    };

    expect(component.getRuleClass(group)).toBe('warning');
    group.rules = [{ id: 'r2', level: 'alert' }];
    expect(component.getRuleClass(group)).toBe('alert');
    group.rules = undefined;
    expect(component.getRuleClass(group)).toBe('');
  });
});
