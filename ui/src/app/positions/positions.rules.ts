export type Severity = 'warning' | 'alert';

export interface RuleResult {
  id: string;
  label: string;
  detail: string;
  action: string;
  level: Severity;
}

import { PositionGroup } from './positions.models';

export type Rule = (group: PositionGroup, today?: Date) => RuleResult | null;

export function evaluateRules(group: PositionGroup, today: Date = new Date()): RuleResult[] {
  return rules.map(rule => rule(group, today)).filter((result): result is RuleResult => result !== null);
}

export const dteRule: Rule = (group, today = new Date()) => {
  const expires = new Date(group.expires_at);
  const days = Math.ceil((expires.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 21) {
    return {
      id: 'dte',
      label: `${days} DTE`,
      detail: `Expiration is ${days} days away; the 21 DTE management threshold has been reached.`,
      action: 'Review duration risk and your management plan.',
      level: 'alert',
    };
  }
  if (days <= 28) {
    return {
      id: 'dte',
      label: `${days} DTE`,
      detail: `Expiration is ${days} days away and approaching the 21 DTE threshold.`,
      action: 'Prepare the management decision.',
      level: 'warning',
    };
  }
  return null;
};

export const profitRule: Rule = group => {
  const total = group.total_credit_received;
  const percent = group.percent_credit_received ?? (total ? Math.round(((total - group.current_group_p_l) / total) * 100) : 0);
  if (percent >= 50) {
    return {
      id: 'profit',
      label: `${percent}% captured`,
      detail: `Credit captured is at or above the 50% management target.`,
      action: 'Review closing or reducing the position.',
      level: 'alert',
    };
  }
  if (percent >= 40) {
    return {
      id: 'profit',
      label: `${percent}% captured`,
      detail: `Credit captured is approaching the 50% management target.`,
      action: 'Watch for the profit target.',
      level: 'warning',
    };
  }
  return null;
};

export const lossRule: Rule = group => {
  const total = group.total_credit_received;
  const percent = group.percent_credit_received ?? (total ? Math.round(((total - group.current_group_p_l) / total) * 100) : 0);
  if (percent <= -200) {
    return {
      id: 'loss',
      label: `${percent}% of credit`,
      detail: `The loss is at or beyond 2x the opening credit.`,
      action: 'Review risk and the exit plan now.',
      level: 'alert',
    };
  }
  if (percent <= -150) {
    return {
      id: 'loss',
      label: `${percent}% of credit`,
      detail: `The loss is approaching 2x the opening credit.`,
      action: 'Recheck risk before the threshold is reached.',
      level: 'warning',
    };
  }
  return null;
};

export const ivRankRule: Rule = group => {
  if (group.iv_rank === null || group.iv_rank === undefined) {
    return null;
  }
  if (group.iv_rank < 10) {
    return {
      id: 'iv-rank',
      label: `IVR ${group.iv_rank}`,
      detail: 'IV rank is below 10, reducing the relative richness of premium.',
      action: 'Recheck whether the original premium-selling thesis still holds.',
      level: 'alert',
    };
  }
  if (group.iv_rank < 14) {
    return {
      id: 'iv-rank',
      label: `IVR ${group.iv_rank}`,
      detail: 'IV rank is below 14 and approaching the low-IV threshold.',
      action: 'Monitor volatility conditions.',
      level: 'warning',
    };
  }
  return null;
};

export const rules: Rule[] = [dteRule, profitRule, lossRule, ivRankRule];