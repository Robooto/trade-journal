import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { ResearchModule } from '../research.module';
import { FlowIdeasApiService } from './data-access/flow-ideas-api.service';
import { FlowIdeaDetailPageComponent } from './flow-idea-detail-page.component';

describe('FlowIdeaDetailPageComponent', () => {
  it('loads a direct dated-symbol route with inactive candidates and renders brokerage context', async () => {
    const api = {
      history: vi.fn(() =>
        of({
          schema_version: 'flowpatrol-symbol-history.v1' as const,
          symbol: 'AAPL',
          rows: [],
        }),
      ),
      contracts: vi.fn(() =>
        of({
          schema_version: 'flowpatrol-contracts.v1' as const,
          trading_date: '2026-07-09',
          symbol: 'AAPL',
          status: 'partial' as const,
          rows: [],
        }),
      ),
      candidates: vi.fn(() =>
        of({
          schema_version: 'flowpatrol-candidates.v1' as const,
          trading_date: '2026-07-09',
          status: 'partial' as const,
          total: 1,
          limit: 200,
          offset: 0,
          rows: [
            {
              trading_date: '2026-07-09',
              symbol: 'AAPL',
              research_priority: 84.5,
              active_watch: false,
              watch_day: 2,
              change_event: 'strengthened',
              reason_codes: [],
              reason_text: 'Flow evidence',
              spread_ids: [],
              asset_type: 'unclassified',
              is_index_etf: false,
              equityhub_url: 'https://example.test/aapl',
              brokerage_context: {
                symbol: 'AAPL',
                watchlists: [],
                price: { mark: 215.25 },
                volatility: { iv_rank_percent: 42 },
                earnings: { status: 'unavailable' as const },
                exposure: {
                  is_held: true,
                  account_numbers: [],
                  asset_classes: [],
                  option_position_count: 1,
                },
                source_status: [],
                warnings: [],
              },
            },
          ],
          brokerage_enrichment: {
            schema_version: 'research-symbol-context.v1',
            status: 'ready' as const,
            requested_symbol_count: 1,
            matched_symbol_count: 1,
            warnings: [],
          },
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [ResearchModule],
      providers: [
        { provide: FlowIdeasApiService, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(
              convertToParamMap({
                tradingDate: '2026-07-09',
                symbol: 'aapl',
              }),
            ),
            snapshot: { queryParams: { active: 'false' } },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(FlowIdeaDetailPageComponent);
    fixture.detectChanges();

    expect(api.candidates).toHaveBeenCalledWith({
      tradingDate: '2026-07-09',
      symbol: 'AAPL',
      event: '',
      activeOnly: false,
    });
    expect(fixture.nativeElement.textContent).toContain('215.25');
    expect(fixture.nativeElement.textContent).toContain('Held');
  });
});
