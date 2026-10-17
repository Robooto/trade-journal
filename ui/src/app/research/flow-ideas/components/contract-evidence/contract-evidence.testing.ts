import { FlowLedgerContract, FlowSymbolLedgerResponse } from '../../flow-ideas.models';

export function ledgerContract(overrides: Partial<FlowLedgerContract>): FlowLedgerContract {
  return {
    key: 'MU|2026-11-20|980|call', status: 'ready', symbol: 'MU', expiration: '2026-11-20', strike: 980,
    option_type: 'call', days_to_expiration: 36, moneyness_pct: 0.052,
    counts: { bto: 7051, btc: 0, sto: 25, stc: 0 }, opened: 7076, closed: 0, bought: 7051, sold: 25,
    total: 7076, opening_share: 1, bought_share: 0.996, dominant_action: 'BTO', read: 'Bought to open',
    sections: ['delta', 'unusual'], spread_ids: ['6232'], structure_labels: [], total_premium_usd: 28_430_000,
    open_interest: 7474, implied_volatility: 0.52, stock_price: 931.4, sources: [],
    ...overrides,
  };
}

export function ledgerResponse(contracts: FlowLedgerContract[], spreads: FlowSymbolLedgerResponse['ledger']['spreads']): FlowSymbolLedgerResponse {
  return {
    schema_version: 'flowpatrol-symbol-ledger.v1', trading_date: '2026-10-15', symbol: 'MU', status: 'ready',
    ledger: {
      schema_version: 'flowpatrol-contract-ledger.v1', status: 'ready', summary: null, excluded_row_count: 0,
      conflicting_contract_count: 0, contracts, spreads,
    },
    links: { equityhub_url: 'synthoi', equityhub_oi_model_url: 'legacy', equityhub_history_url: 'history' },
  };
}
