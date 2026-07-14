import { dteRule, profitRule, lossRule, ivRankRule, evaluateRules } from './positions.rules';
import { PositionGroup } from './positions.models';

function makeGroup(overrides: Partial<PositionGroup> = {}): PositionGroup {
  return {
    underlying_symbol: 'SPY',
    expires_at: '2025-01-10',
    total_credit_received: 10,
    current_group_p_l: 5,
    percent_credit_received: 50,
    total_delta: 0,
    positions: [],
    ...overrides,
  };
}

describe('positions rules', () => {
  it('dteRule reports the current DTE and severity', () => {
    const today = new Date('2025-01-01');
    expect(dteRule(makeGroup({ expires_at: '2025-01-25' }), today)).toEqual(jasmine.objectContaining({ id: 'dte', label: '24 DTE', level: 'warning' }));
    expect(dteRule(makeGroup({ expires_at: '2025-01-15' }), today)).toEqual(jasmine.objectContaining({ id: 'dte', label: '14 DTE', level: 'alert' }));
  });

  it('profitRule uses percent_credit_received when available', () => {
    expect(profitRule(makeGroup({ percent_credit_received: 55 }))).toEqual(jasmine.objectContaining({ id: 'profit', label: '55% captured', level: 'alert' }));
  });

  it('profitRule calculates percent when not provided', () => {
    const group = makeGroup({ percent_credit_received: null, current_group_p_l: 6, total_credit_received: 10 });
    expect(profitRule(group)).toEqual(jasmine.objectContaining({ id: 'profit', label: '40% captured', level: 'warning' }));
  });

  it('lossRule reports warning and alert thresholds', () => {
    expect(lossRule(makeGroup({ percent_credit_received: -200 }))).toEqual(jasmine.objectContaining({ id: 'loss', level: 'alert' }));
    expect(lossRule(makeGroup({ percent_credit_received: -175 }))).toEqual(jasmine.objectContaining({ id: 'loss', level: 'warning' }));
  });

  it('ivRankRule includes the current IV rank', () => {
    expect(ivRankRule(makeGroup({ iv_rank: 12 }))).toEqual(jasmine.objectContaining({ id: 'iv-rank', label: 'IVR 12', level: 'warning' }));
    expect(ivRankRule(makeGroup({ iv_rank: 9 }))).toEqual(jasmine.objectContaining({ id: 'iv-rank', label: 'IVR 9', level: 'alert' }));
  });

  it('evaluateRules runs only triggered rules in rule order', () => {
    const results = evaluateRules(makeGroup({ percent_credit_received: 55, expires_at: '2025-01-15' }), new Date('2025-01-01'));
    expect(results.map(result => result.id)).toEqual(['dte', 'profit']);
  });

  it('every result explains the signal and a review action', () => {
    const results = evaluateRules(makeGroup({ iv_rank: 12, expires_at: '2025-01-15', percent_credit_received: 0 }), new Date('2025-01-01'));
    expect(results.length).toBe(2);
    results.forEach(result => {
      expect(result.detail.length).toBeGreaterThan(0);
      expect(result.action.length).toBeGreaterThan(0);
    });
  });
});