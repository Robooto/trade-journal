import { CommonModule } from '@angular/common';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../shared/material.module';
import { WatchlistResearchPageComponent } from './watchlist-research-page.component';
import { WatchlistResearchResponse } from './watchlist-research.models';

const responseFixture: WatchlistResearchResponse = {
  schema_version: 'broker-watchlist-research.v1',
  generated_at: '2026-07-23T12:00:00Z',
  writes_enabled: true,
  watchlists: [
    {
      name: 'Core Options',
      symbols: ['AAPL'],
      symbol_count: 1,
    },
    {
      name: 'Momentum',
      symbols: ['NVDA'],
      symbol_count: 1,
    },
  ],
  items: [
    {
      symbol: 'NVDA',
      watchlists: [{ name: 'Momentum', source: 'private' }],
      price: { mark: 180 },
      volatility: { iv_rank_percent: null },
      earnings: { status: 'unavailable' },
      exposure: {
        is_held: false,
        account_numbers: [],
        asset_classes: [],
        option_position_count: 0,
      },
      source_status: [],
      warnings: [],
    },
    {
      symbol: 'AAPL',
      watchlists: [{ name: 'Core Options', source: 'private' }],
      price: { mark: 220, five_session_change_percent: 2.5 },
      volatility: {
        iv_rank_percent: 44,
        iv_rank_5_day_change_percent: 6,
      },
      earnings: { status: 'unavailable' },
      exposure: {
        is_held: true,
        account_numbers: [],
        asset_classes: ['equity'],
        option_position_count: 2,
      },
      source_status: [],
      warnings: [],
    },
  ],
  missing_symbols: [],
  source_status: [],
};

describe('WatchlistResearchPageComponent', () => {
  let fixture: ComponentFixture<WatchlistResearchPageComponent>;
  let component: WatchlistResearchPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WatchlistResearchPageComponent],
      imports: [
        CommonModule,
        FormsModule,
        SharedMaterialModule,
        HttpClientTestingModule,
        NoopAnimationsModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistResearchPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/v1/broker/watchlist-research').flush(responseFixture);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('sorts available IV rank ahead of unavailable values', () => {
    expect(component.visibleItems.map(item => item.symbol)).toEqual([
      'AAPL',
      'NVDA',
    ]);
  });

  it('filters by private list and builds a current Equity Hub link', () => {
    component.selectedWatchlist = 'Momentum';

    expect(component.visibleItems.map(item => item.symbol)).toEqual(['NVDA']);
    expect(component.equityHubUrl('aapl')).toContain('sym=AAPL');
  });
});
