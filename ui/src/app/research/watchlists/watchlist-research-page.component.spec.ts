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

function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

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
      volatility: {
        iv_rank_percent: null,
        iv_index_percent: 43.3,
        iv_index_15_day_percent: 38.2,
        iv_hv_30_day_difference_points: 19.13,
      },
      earnings: {
        status: 'estimated',
        earnings_date: isoInDays(5),
        earnings_time: 'before_open',
      },
      profile: {
        sector: 'Technology',
        lendability: 'Locate Required',
        dividend_ex_date: isoInDays(-20),
      },
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
        iv_hv_30_day_difference_points: 12.91,
      },
      earnings: { status: 'unavailable' },
      profile: {
        market_cap: 5_012_517_062_800,
        lendability: 'Easy To Borrow',
        dividend_ex_date: isoInDays(10),
      },
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

  it('sorts by IV richness over realized and by nearest earnings', () => {
    component.sort = 'iv-hv-desc';
    expect(component.visibleItems.map(item => item.symbol)).toEqual(['NVDA', 'AAPL']);

    component.sort = 'earnings-soonest';
    expect(component.visibleItems.map(item => item.symbol)).toEqual(['NVDA', 'AAPL']);
  });

  it('labels upcoming earnings and counts them as soon', () => {
    const [nvda, aapl] = responseFixture.items;

    expect(component.earningsLabel(nvda)).toContain('BMO · 5d · est.');
    expect(component.earningsTone(nvda)).toBe('soon');
    expect(component.earningsLabel(aapl)).toBe('Unavailable');
    expect(component.metrics.earningsSoon).toBe(1);
  });

  it('flags only upcoming ex-dividend dates and hard-to-borrow names', () => {
    const [nvda, aapl] = responseFixture.items;

    expect(component.upcomingExDividend(nvda)).toBeNull();
    expect(component.upcomingExDividend(aapl)).not.toBeNull();
    expect(component.isHardToBorrow(nvda)).toBe(true);
    expect(component.isHardToBorrow(aapl)).toBe(false);
    expect(component.frontIvPremium(nvda)).toBeCloseTo(-5.1);
    expect(component.formatMarketCap(aapl.profile?.market_cap)).toBe('$5.0T');
  });

  it('flags IV rank above the provider 52-week range', () => {
    expect(component.isAboveRankRange(117.2)).toBe(true);
    expect(component.isAboveRankRange(100)).toBe(false);
    expect(component.isAboveRankRange(null)).toBe(false);
  });

  it('filters by private list and builds both current Equity Hub links', () => {
    component.selectedWatchlist = 'Momentum';

    expect(component.visibleItems.map(item => item.symbol)).toEqual(['NVDA']);
    expect(component.equityHubUrl('aapl')).toContain('sym=AAPL');
    expect(component.oiEquityHubUrl('aapl')).toContain('eh-model=legacy');
    expect(component.oiEquityHubUrl('aapl')).toContain('tab=history');
  });

  it('adds a ticker to the selected watchlist and refreshes research', () => {
    component.symbolToAdd = ' tsla ';
    component.destinationWatchlist = 'Core Options';

    expect(component.canAddSymbol).toBe(true);
    component.addSymbol();

    const addRequest = http.expectOne(
      '/v1/broker/watchlists/Core%20Options/symbols',
    );
    expect(addRequest.request.method).toBe('POST');
    expect(addRequest.request.body).toEqual({ symbol: 'TSLA' });
    addRequest.flush({
      schema_version: 'watchlist-symbol-write.v1',
      watchlist: {
        name: 'Core Options',
        symbols: ['AAPL', 'TSLA'],
        symbol_count: 2,
      },
      symbol: 'TSLA',
      added: true,
    });

    const refreshRequest = http.expectOne('/v1/broker/watchlist-research');
    refreshRequest.flush({
      ...responseFixture,
      watchlists: [
        {
          name: 'Core Options',
          symbols: ['AAPL', 'TSLA'],
          symbol_count: 2,
        },
        responseFixture.watchlists[1],
      ],
    });
    fixture.detectChanges();

    expect(component.addResult?.symbol).toBe('TSLA');
    expect(component.symbolToAdd).toBe('');
    expect(fixture.nativeElement.textContent).toContain(
      'Added TSLA to Core Options.',
    );
  });

  it('rejects invalid ticker text before making a request', () => {
    component.symbolToAdd = 'not a ticker';
    component.destinationWatchlist = 'Core Options';

    expect(component.canAddSymbol).toBe(false);
    component.addSymbol();
  });
});
