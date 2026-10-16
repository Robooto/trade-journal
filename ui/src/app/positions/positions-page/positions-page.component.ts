import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { PositionsApiService } from '../positions-api.service';
import { AccountPositions, PositionGroup } from '../positions.models';
import { evaluateRules } from '../positions.rules';
import { BracketOrderDialogComponent } from '../bracket-order-dialog/bracket-order-dialog.component';

@Component({
  selector: 'app-positions-page',
  templateUrl: './positions-page.component.html',
  styleUrls: ['./positions-page.component.scss'],
  standalone: false,
})
export class PositionsPageComponent implements OnInit {
  accounts: AccountPositions[] = [];
  loading = false;
  errorMessage = '';
  lastRefreshed?: Date;
  attentionOnly = false;
  groupCols = [
    'underlying',
    'expires',
    'credit',
    'price',
    'percent',
    'delta',
    'betadelta',
    'theta',
    'ivrank',
    'ivchange',
    'rules',
    'legs',
  ];
  positionCols = ['symbol', 'qty', 'type', 'plpos', 'cdelta', 'bo'];
  expandedChartStates: Map<string, PositionGroup | null> = new Map();
  /** Position groups whose legs (and chart, when requested) are shown in a full-width detail row. */
  expandedGroups = new Set<PositionGroup>();

  constructor(private api: PositionsApiService, private dialog: MatDialog) {}

  ngOnInit(): void {
    this.loadPositions();
  }

  loadPositions(): void {
    this.loading = true;
    this.errorMessage = '';
    this.api.getAll().pipe(finalize(() => (this.loading = false))).subscribe({
      next: response => {
        this.accounts = response.accounts;
        this.expandedGroups.clear();
        this.expandedChartStates.clear();
        this.accounts.forEach(account => {
          account.groups.forEach(group => {
            group.rules = evaluateRules(group);
          });
        });
        this.lastRefreshed = new Date();
      },
      error: error => {
        this.errorMessage = error?.error?.detail || 'Positions could not be loaded. Check the API and brokerage connection.';
      },
    });
  }

  get attentionCount(): number {
    return this.accounts.reduce(
      (total, account) => total + account.groups.filter(group => group.rules?.some(rule => rule.level === 'alert')).length,
      0
    );
  }

  visibleGroups(account: AccountPositions): PositionGroup[] {
    if (!this.attentionOnly) {
      return account.groups;
    }
    return account.groups.filter(group => (group.rules?.length ?? 0) > 0);
  }

  toggleAttentionOnly(): void {
    this.attentionOnly = !this.attentionOnly;
  }

  getRuleClass(group: PositionGroup): string {
    if (group.rules?.some(rule => rule.level === 'alert')) {
      return 'alert';
    }
    if (group.rules?.some(rule => rule.level === 'warning')) {
      return 'warning';
    }
    return '';
  }

  ruleTooltip(group: PositionGroup): string {
    return (group.rules ?? []).map(rule => `${rule.detail} ${rule.action}`).join('\n');
  }

  buyingPowerZoneLabel(account: AccountPositions): string {
    const labels = {
      low: 'Low',
      comfortable: 'Comfortable',
      elevated: 'Elevated',
      unavailable: 'Unavailable',
    };
    return labels[account.buying_power_zone ?? 'unavailable'];
  }

  expirationLabel(group: PositionGroup, today = new Date()): string {
    const dates = (group.expiration_dates?.length ? group.expiration_dates : [group.expires_at])
      .map(value => this.expirationDate(value))
      .filter((value): value is Date => value !== null);
    if (!dates.length) return '—';
    return dates.map(date => date.toLocaleDateString(undefined, date.getFullYear() === today.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' })).join(' / ');
  }

  /** Calendar days until the nearest expiration; 0 on expiration day. */
  daysToExpiry(group: PositionGroup, today = new Date()): number | null {
    const dates = (group.expiration_dates?.length ? group.expiration_dates : [group.expires_at])
      .map(value => this.expirationDate(value))
      .filter((value): value is Date => value !== null);
    if (!dates.length) return null;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const nearest = Math.min(...dates.map(date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()));
    return Math.max(0, Math.round((nearest - start.getTime()) / 86_400_000));
  }

  private expirationDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /** Totals across accounts; a missing value is excluded and flagged rather than counted as zero. */
  get portfolioTotals(): { label: string; value: number | null; partial: boolean; currency: boolean }[] {
    const sum = (pick: (account: AccountPositions) => number | null | undefined) => {
      const values = this.accounts.map(pick);
      const present = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
      return { value: present.length ? present.reduce((a, b) => a + b, 0) : null, partial: present.length < values.length };
    };
    return [
      { label: 'Net liquidity', ...sum(a => a.net_liquidating_value_dollars), currency: true },
      { label: 'Available BP', ...sum(a => a.derivative_buying_power_dollars), currency: true },
      { label: 'Theta / day', ...sum(a => a.theta_dollars_per_day ?? a.total_theta), currency: true },
      { label: '+1 vol point', ...sum(a => a.vega_plus_one_point_dollars), currency: true },
      { label: 'Delta shares', ...sum(a => a.delta_shares ?? a.total_position_delta), currency: false },
      { label: 'Beta Δ shares', ...sum(a => a.total_beta_delta_shares ?? a.total_beta_delta), currency: false },
    ];
  }

  get positionGroupCount(): number {
    return this.accounts.reduce((total, account) => total + account.groups.length, 0);
  }

  isExpanded(group: PositionGroup): boolean {
    return this.expandedGroups.has(group);
  }

  toggleExpanded(group: PositionGroup): void {
    if (this.expandedGroups.has(group)) this.expandedGroups.delete(group);
    else this.expandedGroups.add(group);
  }

  /** Detail rows render only when expanded, so hidden leg tables never take layout width. */
  readonly isDetailRow = (_index: number, group: PositionGroup) => this.expandedGroups.has(group);

  strategyLabel(group: PositionGroup): string {
    return (group.strategy_label || '').replaceAll('_', ' ');
  }

  buyingPowerTooltip(account: AccountPositions): string {
    const utilization = account.buying_power_utilization_percent;
    const value = utilization == null ? 'unavailable' : `${utilization.toFixed(1)}%`;
    return `Used derivative buying power ÷ net liquidating value: ${value}. App review zones: low below 20%, comfortable 20–40%, elevated above 40%. These are review cues, not brokerage rules.`;
  }

  concentrationTooltip(account: AccountPositions): string {
    const item = account.largest_underlying_concentration;
    if (!item) {
      return 'No beta-delta concentration is available.';
    }
    const basis = item.exposure_basis === 'delta_shares_fallback' ? 'delta shares (beta unavailable)' : item.exposure_basis === 'mixed' ? 'mixed beta-delta and delta fallback' : 'beta-delta shares';
    return `${item.underlying_symbol} represents ${item.absolute_beta_delta_share_percent?.toFixed(1) ?? '—'}% of total absolute Greek exposure using ${basis}. This is not capital or notional concentration.`;
  }

  balanceTooltip(account: AccountPositions): string {
    const warnings = account.balance_warnings ?? [];
    return warnings.length ? warnings.join('\n') : 'Brokerage balance fields were available when positions were refreshed.';
  }

  onUnderlyingClick(group: PositionGroup, event: Event, account: AccountPositions): void {
    event.stopPropagation();
    if (!this.isValidChartSymbol(group.underlying_symbol)) {
      return;
    }
    const accountKey = account.account_number;
    const currentExpanded = this.expandedChartStates.get(accountKey);
    this.expandedChartStates.set(accountKey, currentExpanded === group ? null : group);
    if (currentExpanded !== group) this.expandedGroups.add(group);
  }

  isValidChartSymbol(symbol: string): boolean {
    return !symbol.includes('/');
  }

  isChartExpanded(group: PositionGroup, account: AccountPositions): boolean {
    return this.expandedChartStates.get(account.account_number) === group;
  }

  openBracketOrder(position: Record<string, any>, account: AccountPositions): void {
    this.dialog.open(BracketOrderDialogComponent, {
      width: '560px',
      maxWidth: 'calc(100vw - 24px)',
      data: { accountNumber: account.account_number, position },
    });
  }
}