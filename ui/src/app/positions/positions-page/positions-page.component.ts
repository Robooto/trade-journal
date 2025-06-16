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
    'pl',
    'percent',
    'ivrank',
    'rules',
    'positions',
  ];

  positionCols = ['symbol', 'qty', 'type', 'plpos'];

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
}
