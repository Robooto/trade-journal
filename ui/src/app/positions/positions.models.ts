export interface Position {
  beta?: number | null;
  [key: string]: any;
}

export interface PositionGroup {
  underlying_symbol: string;
  expires_at: string;
  total_credit_received: number;
  current_group_p_l: number;
  percent_credit_received: number | null;
  total_delta?: number | null;
  beta_delta?: number | null;
  iv_rank?: number | null;
  iv_5d_change?: number | null;
  rules?: import('./positions.rules').RuleResult[];
  positions: Position[];
}

export interface AccountPositions {
  account_number: string;
  nickname?: string;
  groups: PositionGroup[];
  total_beta_delta?: number | null;
}

export interface PositionsResponse {
  accounts: AccountPositions[];
}
