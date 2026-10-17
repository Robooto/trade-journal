import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import {
  FlowLedgerContract,
  FlowLedgerSpread,
  FlowSpreadPattern,
  FlowSymbolLedgerResponse,
} from '../../flow-ideas.models';

export interface FlowSpreadView {
  readonly key: string;
  readonly title: string;
  readonly reference: string;
  readonly description: string | null;
  readonly premium: number | null;
  readonly legs: readonly FlowLedgerContract[];
}

const PATTERN_TITLES: Record<FlowSpreadPattern, string> = {
  roll: 'Roll',
  vertical: 'Vertical',
  calendar_or_diagonal: 'Calendar / diagonal',
  calls_and_puts: 'Calls and puts',
  multi_leg: 'Multi-leg',
  single_leg_shown: 'One leg shown',
  source_named: 'Named by SpotGamma',
};

const OPENING_READS = new Set(['Bought to open', 'Sold to open', 'Mostly opening']);
const CLOSING_READS = new Set(['Bought to close', 'Sold to close', 'Mostly closing']);

@Component({
  selector: 'app-contract-evidence',
  templateUrl: './contract-evidence.component.html',
  styleUrls: ['./contract-evidence.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class ContractEvidenceComponent implements OnChanges {
  @Input() ledger: FlowSymbolLedgerResponse | null = null;
  @Input() loading = false;
  @Input() error: string | null = null;

  spreads: readonly FlowSpreadView[] = [];

  readonly contractLabel = contractLabel;
  readonly moneynessLabel = moneynessLabel;
  readonly compactUsd = compactUsd;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['ledger']) {
      this.spreads = buildSpreadViews(this.ledger);
    }
  }

  readTone(contract: FlowLedgerContract): string {
    if (OPENING_READS.has(contract.read)) return 'opening';
    if (CLOSING_READS.has(contract.read)) return 'closing';
    return 'mixed';
  }
}

export function buildSpreadViews(response: FlowSymbolLedgerResponse | null): readonly FlowSpreadView[] {
  if (!response) return [];
  const byKey = new Map(response.ledger.contracts.map(contract => [contract.key, contract]));
  return response.ledger.spreads
    // A lone leg is already in the contract list; only linked legs earn a card.
    .filter(spread => spread.leg_keys.length > 1)
    .map(spread => {
      const legs = spread.leg_keys
        .map(key => byKey.get(key))
        .filter((leg): leg is FlowLedgerContract => !!leg);
      return {
        key: spread.spread_id ?? spread.source_label ?? spread.leg_keys.join(','),
        title: spread.pattern === 'source_named' ? spread.source_label ?? 'Named structure' : PATTERN_TITLES[spread.pattern],
        reference: spread.spread_id
          ? `Spread ${spread.spread_id}`
          : 'Older report: legs share a label, not an ID, and may be separate trades',
        description: describeSpread(spread, legs),
        premium: spread.total_premium_usd,
        legs,
      };
    });
}

function describeSpread(spread: FlowLedgerSpread, legs: readonly FlowLedgerContract[]): string | null {
  if (spread.pattern !== 'roll') return null;
  const closing = legs.find(leg => (leg.opening_share ?? 1) <= 0.4);
  const opening = legs.find(leg => (leg.opening_share ?? 0) >= 0.6);
  if (!closing || !opening) return null;
  return `Closed ${contractLabel(closing)}, opened ${contractLabel(opening)}`;
}

export function contractLabel(contract: Pick<FlowLedgerContract, 'expiration' | 'strike' | 'option_type'>): string {
  return `${expirationLabel(contract.expiration)} ${formatStrike(contract.strike)}${contract.option_type === 'call' ? 'C' : 'P'}`;
}

export function expirationLabel(expiration: string): string {
  const date = new Date(`${expiration}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return expiration;
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${date.getUTCDate()} '${String(date.getUTCFullYear()).slice(-2)}`;
}

export function moneynessLabel(contract: Pick<FlowLedgerContract, 'moneyness_pct' | 'option_type'>): string | null {
  const value = contract.moneyness_pct;
  if (value == null) return null;
  if (Math.abs(value) < 0.005) return 'ATM';
  const outOfMoney = contract.option_type === 'call' ? value > 0 : value < 0;
  return `${(Math.abs(value) * 100).toFixed(1)}% ${outOfMoney ? 'OTM' : 'ITM'}`;
}

export function compactUsd(value: number | null | undefined): string {
  if (value == null) return '–';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1,
  }).format(value);
}

function formatStrike(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : strike.toFixed(2).replace(/0$/, '');
}
