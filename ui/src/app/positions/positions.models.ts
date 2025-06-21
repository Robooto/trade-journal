export interface Position {
  [key: string]: any;
}

export interface PositionGroup {
  underlying_symbol: string;
  expires_at: string;
  total_credit_received: number;
  current_group_price: number;
  group_approximate_p_l: number;
  percent_credit_received: number | null;
  total_delta?: number | null;
  iv_rank?: number | null;
  rules?: import('./positions.rules').RuleResult[];
  positions: Position[];
}

export interface AccountPositions {
  account_number: string;
  nickname?: string;
  groups: PositionGroup[];
}

export interface PositionsResponse {
  accounts: AccountPositions[];
}
