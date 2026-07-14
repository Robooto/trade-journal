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
    'ivrank',
    'ivchange',
    'rules',
    'positions',
  ];
  positionCols = ['symbol', 'qty', 'type', 'plpos', 'cdelta', 'bo'];
  expandedChartStates: Map<string, PositionGroup | null> = new Map();

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

  onUnderlyingClick(group: PositionGroup, event: Event, account: AccountPositions): void {
    event.stopPropagation();
    if (!this.isValidChartSymbol(group.underlying_symbol)) {
      return;
    }
    const accountKey = account.account_number;
    const currentExpanded = this.expandedChartStates.get(accountKey);
    this.expandedChartStates.set(accountKey, currentExpanded === group ? null : group);
  }

  isValidChartSymbol(symbol: string): boolean {
    return !symbol.includes('/');
  }

  isChartExpanded(group: PositionGroup, account: AccountPositions): boolean {
    return this.expandedChartStates.get(account.account_number) === group;
  }

  getExpandedChartForAccount(account: AccountPositions): PositionGroup | null {
    return this.expandedChartStates.get(account.account_number) || null;
  }

  openBracketOrder(position: Record<string, any>, account: AccountPositions): void {
    this.dialog.open(BracketOrderDialogComponent, {
      width: '560px',
      maxWidth: 'calc(100vw - 24px)',
      data: { accountNumber: account.account_number, position },
    });
  }
}