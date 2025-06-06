import { Component, OnInit } from '@angular/core';
import { PositionsApiService } from '../positions-api.service';
import { AccountPositions } from '../positions.models';

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
    'positions'
  ];

  positionCols = ['symbol', 'qty', 'type', 'plpos'];

  constructor(private api: PositionsApiService) {}

  ngOnInit() {
    this.api.getAll().subscribe(res => {
      this.accounts = res.accounts;
    });
  }
}
