import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import {
  FlowCandidatesResponse,
  FlowDatesResponse,
} from './flow-ideas.models';
import { FlowIdeasApiService } from './data-access/flow-ideas-api.service';
import { ResearchModule } from '../research.module';
import { FlowIdeasPageComponent } from './flow-ideas-page.component';

const datesFixture: FlowDatesResponse = {
  schema_version: 'flowpatrol-dates.v1',
  dates: [
    {
      trading_date: '2026-07-09',
      status: 'partial',
      candidate_count: 2,
      quality_issue_count: 1,
    },
  ],
};

const candidatesFixture: FlowCandidatesResponse = {
  schema_version: 'flowpatrol-candidates.v1',
  trading_date: '2026-07-09',
  status: 'partial',
  total: 7,
  limit: 200,
  offset: 0,
  rows: [
    {
      trading_date: '2026-07-09',
      symbol: 'AAPL',
      research_priority: 84.5,
      active_watch: true,
      watch_day: 2,
      change_event: 'strengthened',
      reason_codes: ['delta_upper_extreme'],
      reason_text: 'delta 95th percentile',
      spread_ids: [],
      asset_type: 'unclassified',
      is_index_etf: false,
      equityhub_url: 'https://example.test/aapl',
      brokerage_context: null,
    },
    {
      trading_date: '2026-07-09',
      symbol: 'SPX',
      research_priority: 61,
      active_watch: false,
      watch_day: 1,
      change_event: 'new',
      reason_codes: ['large_premium'],
      reason_text: 'large premium',
      spread_ids: [],
      asset_type: 'broad_index_etf',
      is_index_etf: true,
      equityhub_url: 'https://example.test/spx',
      brokerage_context: null,
    },
  ],
  brokerage_enrichment: {
    schema_version: 'research-symbol-context.v1',
    status: 'not_requested',
    requested_symbol_count: 0,
    matched_symbol_count: 0,
    warnings: [],
  },
};

describe('FlowIdeasPageComponent', () => {
  it('renders the checked queue shape and filters only backend-classified indexes', async () => {
    await TestBed.configureTestingModule({
      imports: [ResearchModule, RouterTestingModule],
      providers: [
        {
          provide: FlowIdeasApiService,
          useValue: {
            dates: () => of(datesFixture),
            candidates: () => of(candidatesFixture),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FlowIdeasPageComponent);
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('.flow-candidate').length).toBe(2);
    expect(page.textContent).toContain('2 of 7');
    expect(page.textContent).toContain('Partial FlowPatrol report');
    expect(page.textContent).toContain('Brokerage context was not requested');

    const component = fixture.componentInstance;
    component.onUniverseChange(false);
    fixture.detectChanges();

    expect(page.querySelectorAll('.flow-candidate').length).toBe(1);
    expect(page.textContent).toContain('1 of 7');
    expect(page.textContent).toContain('AAPL');
    expect(page.textContent).not.toContain('SPX');
  });

  it('keeps the typed symbol in the input until the debounce commits it', async () => {
    await TestBed.configureTestingModule({
      imports: [ResearchModule, RouterTestingModule],
      providers: [
        {
          provide: FlowIdeasApiService,
          useValue: {
            dates: () => of(datesFixture),
            candidates: () => of(candidatesFixture),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FlowIdeasPageComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const symbolInput = fixture.nativeElement.querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;

    symbolInput.value = 'aapl';
    symbolInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(component.facade.serverFilters().symbol).toBe('');
    expect(symbolInput.value).toBe('aapl');
  });
});
