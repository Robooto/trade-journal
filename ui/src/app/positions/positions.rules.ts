export type Severity = 'warning' | 'alert';

export interface RuleResult {
  id: string;
  level: Severity;
}

import { PositionGroup } from './positions.models';

export type Rule = (
  group: PositionGroup,
  today?: Date
) => RuleResult | null;

export function evaluateRules(
  group: PositionGroup,
  today: Date = new Date()
): RuleResult[] {
  return rules
    .map(rule => rule(group, today))
    .filter((r): r is RuleResult => r !== null);
}

export const dteRule: Rule = (g, today = new Date()) => {
  const expires = new Date(g.expires_at);
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.ceil((expires.getTime() - today.getTime()) / msPerDay);
  if (days <= 21) {
    return { id: '21 dte', level: 'alert' };
  }
  if (days <= 28) {
    return { id: '21 dte', level: 'warning' };
  }
  return null;
};

export const profitRule: Rule = g => {
  const total = g.total_credit_received;
  let pct = g.percent_credit_received;
  if (pct === null || pct === undefined) {
    pct = total ? Math.round((g.group_approximate_p_l / total) * 100) : 0;
  }

  if (pct >= 50) {
    return { id: '50% profit', level: 'alert' };
  }
  if (pct >= 40) {
    return { id: '50% profit', level: 'warning' };
  }
  return null;
};

export const lossRule: Rule = g => {
  const total = g.total_credit_received;
  let pct = g.percent_credit_received;
  if (pct === null || pct === undefined) {
    pct = total ? Math.round((g.group_approximate_p_l / total) * 100) : 0;
  }

  if (pct <= -150) {
    return { id: '2x loss', level: 'warning' };
  }
  if (pct <= -200) {
    return { id: '2x loss', level: 'alert' };
  }
  return null;
};

export const ivRankRule: Rule = g => {
  if (g.iv_rank === null || g.iv_rank === undefined) {
    return null;
  }
  if (g.iv_rank < 10) {
    return { id: '14 iv rank', level: 'alert' };
  }
  if (g.iv_rank < 14) {
    return { id: '14 iv rank', level: 'warning' };
  }
  return null;
};

export const rules: Rule[] = [dteRule, profitRule, lossRule, ivRankRule];
