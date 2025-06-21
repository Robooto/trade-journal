import { dteRule, profitRule, lossRule, ivRankRule, evaluateRules } from './positions.rules';
import { PositionGroup } from './positions.models';

function makeGroup(overrides: Partial<PositionGroup> = {}): PositionGroup {
  return {
    underlying_symbol: 'SPY',
    expires_at: '2025-01-10',
    total_credit_received: 10,
    current_group_price: 5,
    group_approximate_p_l: 5,
    percent_credit_received: 50,
    total_delta: 0,
    positions: [],
    ...overrides
  };
}

describe('positions rules', () => {
  it('dteRule flags alerts and warnings correctly', () => {
    const today = new Date('2025-01-01');
    const warningGroup = makeGroup({ expires_at: '2025-01-25' });
    const alertGroup = makeGroup({ expires_at: '2025-01-15' });
    expect(dteRule(warningGroup, today)).toEqual({ id: '21 dte', level: 'warning' });
    expect(dteRule(alertGroup, today)).toEqual({ id: '21 dte', level: 'alert' });
  });

  it('profitRule uses percent_credit_received when available', () => {
    const g = makeGroup({ percent_credit_received: 55 });
    expect(profitRule(g)).toEqual({ id: '50% profit', level: 'alert' });
  });

  it('profitRule calculates percent when not provided', () => {
    const g = makeGroup({ percent_credit_received: null, group_approximate_p_l: 4, total_credit_received: 10 });
    expect(profitRule(g)).toEqual({ id: '50% profit', level: 'warning' });
  });

  it('lossRule uses percent_credit_received when available', () => {
    const g = makeGroup({ percent_credit_received: -200 });
    expect(lossRule(g)).toEqual({ id: '2x loss', level: 'warning' });
  });

  it('lossRule calculates percent when not provided', () => {
    const g = makeGroup({
      percent_credit_received: null,
      group_approximate_p_l: -15,
      total_credit_received: 10
    });
    expect(lossRule(g)).toEqual({ id: '2x loss', level: 'warning' });
  });

  it('ivRankRule flags alerts and warnings correctly', () => {
    const warning = makeGroup({ iv_rank: 12 });
    const alert = makeGroup({ iv_rank: 9 });
    expect(ivRankRule(warning)).toEqual({ id: 'low iv rank', level: 'warning' });
    expect(ivRankRule(alert)).toEqual({ id: 'low iv rank', level: 'alert' });
  });

  it('evaluateRules runs only triggered rules', () => {
    const g = makeGroup({ percent_credit_received: 55, expires_at: '2025-01-15' });
    const results = evaluateRules(g, new Date('2025-01-01'));
    expect(results.length).toBe(2);
    expect(results[0].id).toBe('21 dte');
    expect(results[1].id).toBe('50% profit');
  });

  it('evaluateRules includes lossRule when triggered', () => {
    const g = makeGroup({
      percent_credit_received: -195,
      expires_at: '2025-01-15'
    });
    const results = evaluateRules(g, new Date('2025-01-01'));
    expect(results.length).toBe(2);
    expect(results[0]).toEqual({ id: '21 dte', level: 'alert' });
    expect(results[1]).toEqual({ id: '2x loss', level: 'warning' });
  });

  it('evaluateRules includes ivRankRule when triggered', () => {
    const g = makeGroup({
      iv_rank: 12,
      expires_at: '2025-01-15',
      percent_credit_received: 0
    });
    const results = evaluateRules(g, new Date('2025-01-01'));
    expect(results.length).toBe(2);
    expect(results[0]).toEqual({ id: '21 dte', level: 'alert' });
    expect(results[1]).toEqual({ id: 'low iv rank', level: 'warning' });
  });
});
