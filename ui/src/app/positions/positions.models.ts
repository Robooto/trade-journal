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
  delta_shares?: number | null;
  theta_dollars_per_day?: number | null;
  vega_dollars_per_vol_point?: number | null;
  gamma_display?: number | null;
  total_position_delta?: number | null;
  total_theta?: number | null;
  total_vega?: number | null;
  total_gamma?: number | null;
  total_rho?: number | null;
  beta_delta?: number | null;
  beta_delta_shares?: number | null;
  iv_rank?: number | null;
  iv_5d_change?: number | null;
  rules?: import('./positions.rules').RuleResult[];
  positions: Position[];
}

export interface UnderlyingConcentration {
  underlying_symbol: string;
  delta_shares: number;
  beta_delta_shares: number;
  absolute_beta_delta_share_percent?: number | null;
  group_count: number;
  exposure_basis: 'beta_delta_shares' | 'delta_shares_fallback' | 'mixed';
}

export interface AccountPositions {
  account_number: string;
  nickname?: string;
  groups: PositionGroup[];
  total_beta_delta?: number | null;
  total_beta_delta_shares?: number | null;
  delta_shares?: number | null;
  theta_dollars_per_day?: number | null;
  vega_dollars_per_vol_point?: number | null;
  gamma_display?: number | null;
  total_position_delta?: number | null;
  total_theta?: number | null;
  total_vega?: number | null;
  total_gamma?: number | null;
  total_rho?: number | null;
  percent_used_bp?: number | null;
  net_liquidating_value_dollars?: number | null;
  margin_equity_dollars?: number | null;
  used_derivative_buying_power_dollars?: number | null;
  derivative_buying_power_dollars?: number | null;
  equity_buying_power_dollars?: number | null;
  buying_power_utilization_percent?: number | null;
  buying_power_zone?: 'comfortable' | 'elevated' | 'high' | 'unavailable';
  theta_percent_of_net_liq_per_day?: number | null;
  vega_plus_one_point_dollars?: number | null;
  vega_plus_one_point_percent_of_net_liq?: number | null;
  underlying_concentrations?: UnderlyingConcentration[];
  largest_underlying_concentration?: UnderlyingConcentration | null;
  balance_status?: 'ok' | 'partial' | 'unavailable';
  balance_warnings?: string[];
  balance_fetched_at?: string | null;
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
  confirmed: boolean;
}

export interface BracketOrderResponse {
  'dry-run': boolean;
  payload: Record<string, any>;
  'take-profit-price': number;
  'stop-loss-price': number;
  'tasty-response'?: Record<string, any> | null;
}
