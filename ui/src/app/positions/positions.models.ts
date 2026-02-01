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
  percent_used_bp?: number | null;
}

export interface PositionsResponse {
  accounts: AccountPositions[];
}

export interface BracketOrderRequest {
  'account-number': string;
  symbol: string;
  'instrument-type': string;
  quantity: number;
  multiplier: number;
  'quantity-direction': string;
  'cost-effect'?: string;
  'entry-price': number;
  'take-profit-percent': number;
  'stop-loss-percent': number;
  'dry-run': boolean;
}

export interface BracketOrderResponse {
  'dry-run': boolean;
  payload: Record<string, any>;
  'take-profit-price': number;
  'stop-loss-price': number;
  'tasty-response'?: Record<string, any> | null;
}
