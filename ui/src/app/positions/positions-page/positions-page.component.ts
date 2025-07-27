import { Component, OnInit } from '@angular/core';
import { PositionsApiService } from '../positions-api.service';
import { AccountPositions, PositionGroup } from '../positions.models';
import { evaluateRules } from '../positions.rules';

@Component({
  selector: 'app-positions-page',
  templateUrl: './positions-page.component.html',
  styleUrls: ['./positions-page.component.scss'],
  standalone: false,
})
export class PositionsPageComponent implements OnInit {
  accounts: AccountPositions[] = [];
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

  positionCols = ['symbol', 'qty', 'type', 'plpos', 'cdelta'];
  expandedChartStates: Map<string, PositionGroup | null> = new Map();

  constructor(private api: PositionsApiService) {}

  ngOnInit() {
    this.api.getAll().subscribe(res => {
      this.accounts = res.accounts;
      this.accounts.forEach(acct => {
        acct.groups.forEach(g => {
          g.rules = evaluateRules(g);
        });
      });
    });
  }

  getRuleClass(group: PositionGroup): string {
    if (!group.rules) {
      return '';
    }
    if (group.rules.some(r => r.level === 'alert')) {
      return 'alert';
    }
    if (group.rules.some(r => r.level === 'warning')) {
      return 'warning';
    }
    return '';
  }

  onUnderlyingClick(group: PositionGroup, event: Event, account: AccountPositions): void {
    event.stopPropagation();
    
    // Check if symbol is valid for charting (no "/" symbols)
    if (!this.isValidChartSymbol(group.underlying_symbol)) {
      return;
    }

    const accountKey = account.account_number;
    const currentExpanded = this.expandedChartStates.get(accountKey);

    // Toggle chart expansion for this specific account
    if (currentExpanded === group) {
      this.expandedChartStates.set(accountKey, null);
    } else {
      this.expandedChartStates.set(accountKey, group);
    }
  }

  isValidChartSymbol(symbol: string): boolean {
    // Exclude symbols with "/" (like spread symbols)
    return !symbol.includes('/');
  }

  isChartExpanded(group: PositionGroup, account: AccountPositions): boolean {
    const accountKey = account.account_number;
    return this.expandedChartStates.get(accountKey) === group;
  }

  getExpandedChartForAccount(account: AccountPositions): PositionGroup | null {
    const accountKey = account.account_number;
    return this.expandedChartStates.get(accountKey) || null;
  }
}
