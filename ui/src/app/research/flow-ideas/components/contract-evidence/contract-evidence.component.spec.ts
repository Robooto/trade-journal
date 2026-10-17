import {
  buildSpreadViews,
  compactUsd,
  contractLabel,
  moneynessLabel,
} from './contract-evidence.component';
import { ledgerContract, ledgerResponse } from './contract-evidence.testing';

describe('contract flow ledger view', () => {
  const opening = ledgerContract({});
  const closing = ledgerContract({
    key: 'MU|2026-12-18|1150|call', expiration: '2026-12-18', strike: 1150, opening_share: 0,
    read: 'Sold to close', total: 6948,
  });

  it('describes a roll by its closing and opening legs', () => {
    const [roll] = buildSpreadViews(ledgerResponse([opening, closing], [
      { spread_id: '6232', source_label: null, pattern: 'roll', total_premium_usd: 41_690_000,
        leg_keys: [opening.key, closing.key] },
    ]));
    expect(roll.title).toBe('Roll');
    expect(roll.reference).toBe('Spread 6232');
    expect(roll.description).toBe("Closed Dec 18 '26 1150C, opened Nov 20 '26 980C");
    expect(roll.legs.map(leg => leg.key)).toEqual([opening.key, closing.key]);
  });

  it('shows named older structures without reading them as one trade, and skips lone legs', () => {
    const views = buildSpreadViews(ledgerResponse([opening, closing], [
      { spread_id: null, source_label: 'Put Spread Open', pattern: 'source_named', total_premium_usd: null,
        leg_keys: [opening.key, closing.key] },
      { spread_id: '9', source_label: null, pattern: 'single_leg_shown', total_premium_usd: null,
        leg_keys: [opening.key] },
    ]));
    expect(views.length).toBe(1);
    expect(views[0].title).toBe('Put Spread Open');
    expect(views[0].reference).toContain('may be separate trades');
    expect(views[0].description).toBeNull();
  });

  it('formats contracts, moneyness by option type, and premium', () => {
    expect(contractLabel({ expiration: '2027-01-15', strike: 157.5, option_type: 'put' })).toBe("Jan 15 '27 157.5P");
    expect(moneynessLabel({ moneyness_pct: 0.052, option_type: 'call' })).toBe('5.2% OTM');
    expect(moneynessLabel({ moneyness_pct: 0.052, option_type: 'put' })).toBe('5.2% ITM');
    expect(moneynessLabel({ moneyness_pct: 0.001, option_type: 'put' })).toBe('ATM');
    expect(moneynessLabel({ moneyness_pct: null, option_type: 'put' })).toBeNull();
    expect(compactUsd(28_430_000)).toBe('$28.4M');
    expect(compactUsd(null)).toBe('–');
  });
});
