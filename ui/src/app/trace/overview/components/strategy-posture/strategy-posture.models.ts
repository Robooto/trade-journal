export type StrategyPostureStatus = 'ready' | 'unavailable' | 'ineligible';
export type StrategyPosture = 'bull_put_credit_watch' | 'bear_call_credit_watch' | 'stand_aside';

export interface StrategyPostureResponse {
  readonly schema_version: 'spx-0dte-strategy-posture-shadow.v1';
  readonly status: StrategyPostureStatus;
  readonly classification_status: StrategyPostureStatus;
  readonly date: string;
  readonly generated_at: string;
  readonly as_of: string | null;
  readonly capture_id: string | null;
  readonly prior_capture_id: string | null;
  readonly selection: 'exact' | 'latest';
  readonly posture: StrategyPosture | null;
  readonly direction: 'bull_put' | 'bear_call' | null;
  readonly reason_codes: readonly string[];
  readonly frozen_structure: {
    readonly type: string | null;
    readonly level: number;
    readonly distance_points_at_freeze: number;
  } | null;
  readonly protocol: {
    readonly id: 'spx-0dte-strategy-posture-v1';
    readonly status: 'preregistered';
    readonly frozen_on: string;
    readonly prospective_start_date: string;
    readonly automatic_scoring: false;
  };
  readonly research: {
    readonly study_id: 'spx-0dte-strategy-posture';
    readonly status: string;
    readonly scoring_enabled: boolean;
    readonly mode: 'shadow';
  };
  readonly provenance: {
    readonly date: string;
    readonly capture_id: string | null;
    readonly capture_ts: string | null;
    readonly prior_capture_id: string | null;
    readonly prior_capture_ts: string | null;
  };
  readonly observations: {
    readonly spot: number | null;
    readonly pocket_sign: string | null;
    readonly spx_hiro: number | null;
    readonly spx_hiro_delta: number | null;
    readonly equities_hiro: number | null;
    readonly equities_hiro_delta: number | null;
  };
  readonly warnings: readonly string[];
}
