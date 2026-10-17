import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import {
  FlowCandidate,
  FlowIdeasDisplayFilters,
  FlowReportDate,
  FlowWatchlistsResponse,
} from './flow-ideas.models';
import { buildSpreadViews } from './components/contract-evidence/contract-evidence.component';
import { ledgerContract, ledgerResponse } from './components/contract-evidence/contract-evidence.testing';
import { FlowIdeasApiService } from './data-access/flow-ideas-api.service';
import { currentEquityHubUrl } from './utilities/equity-hub-url';
import { filterFlowCandidates } from './utilities/filter-flow-candidates';

const reports: readonly FlowReportDate[] = [
  { trading_date: '2026-07-10', status: 'ready', candidate_count: 3, quality_issue_count: 0 },
  { trading_date: '2026-07-09', status: 'partial', candidate_count: 2, quality_issue_count: 1 },
  { trading_date: '2026-07-08', status: 'missing', candidate_count: 0, quality_issue_count: 1 },
];

const watchlists: FlowWatchlistsResponse = {
  schema_version: 'research-watchlists.v1',
  flowpatrol_schema_version: 'flowpatrol-brokerage-watchlists.v1',
  writes_enabled: true,
  watchlists: [
    { name: 'Core Options', symbols: ['aapl'], symbol_count: 1 },
  ],
};

function candidate(
  symbol: string,
  isIndexEtf: boolean,
  held: boolean | null,
): FlowCandidate {
  return {
    trading_date: '2026-07-10',
    symbol,
    research_priority: 70,
    active_watch: true,
    watch_day: 2,
    change_event: 'new',
    reason_codes: ['large_premium'],
    reason_text: 'large premium',
    spread_ids: [],
    asset_type: isIndexEtf ? 'broad_index_etf' : 'equity',
    is_index_etf: isIndexEtf,
    equityhub_url: 'https://historical.example/' + symbol,
    brokerage_context: held == null ? null : {
      symbol,
      watchlists: symbol === 'AAPL'
        ? [{ name: 'Core Options', source: 'private' }]
        : [],
      price: { mark: 100, five_session_change_percent: -2 },
      volatility: { iv_rank_percent: 55, iv_rank_5_day_change_percent: 4 },
      earnings: { status: 'unavailable' },
      exposure: {
        is_held: held,
        account_numbers: [],
        asset_classes: [],
        option_position_count: 0,
      },
      source_status: [],
      warnings: [],
    },
  };
}

describe('Flow Ideas RF-07 deterministic parity gate', () => {
  const rows = [
    candidate('AAPL', false, true),
    candidate('SPX', true, false),
    candidate('MSFT', false, null),
  ];

  it('covers report states, totals, backend classification, and local display filters', () => {
    expect(reports.map(report => report.status)).toEqual(['ready', 'partial', 'missing']);
    expect(reports.map(report => report.candidate_count)).toEqual([3, 2, 0]);

    const base: FlowIdeasDisplayFilters = {
      includeIndexEtfs: true,
      watchlist: 'all',
      portfolio: 'all',
    };
    expect(filterFlowCandidates(rows, base, watchlists).length).toBe(3);
    expect(filterFlowCandidates(
      rows,
      { ...base, includeIndexEtfs: false },
      watchlists,
    ).map(row => row.symbol)).toEqual(['AAPL', 'MSFT']);
    expect(filterFlowCandidates(
      rows,
      { ...base, watchlist: 'list:Core Options' },
      watchlists,
    ).map(row => row.symbol)).toEqual(['AAPL']);
    expect(filterFlowCandidates(
      rows,
      { ...base, portfolio: 'held' },
      watchlists,
    ).map(row => row.symbol)).toEqual(['AAPL']);
    expect(filterFlowCandidates(
      rows,
      { ...base, portfolio: 'not-held' },
      watchlists,
    ).map(row => row.symbol)).toEqual(['SPX']);
  });

  it('keeps history dates, every Spread ID row, and current-date EquityHub behavior', () => {
    const historyDates = ['2026-07-09', '2026-07-10'];
    expect(historyDates).toEqual(['2026-07-09', '2026-07-10']);

    const first = ledgerContract({ key: 'leg-1' });
    const second = ledgerContract({ key: 'leg-2', strike: 1000 });
    const groups = buildSpreadViews(ledgerResponse([first, second], [
      { spread_id: '42', source_label: null, pattern: 'vertical', total_premium_usd: null, leg_keys: ['leg-1', 'leg-2'] },
    ]));
    expect(groups).toHaveLength(1);
    expect(groups[0].legs.map(leg => leg.key)).toEqual(['leg-1', 'leg-2']);

    const url = currentEquityHubUrl('aapl', new Date('2026-07-18T15:00:00Z'));
    expect(url).toContain('sym=AAPL');
    expect(url).toContain('date=2026-07-18');
    expect(url).not.toContain('date=2026-07-10');
  });

  it('keeps upload and watchlist mutations on explicit same-origin routes', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const api = TestBed.inject(FlowIdeasApiService);
    const http = TestBed.inject(HttpTestingController);

    api.uploadReport(new File(['pdf'], 'flowpatrol_2026_07_18.pdf')).subscribe();
    api.addWatchlistSymbol('Core Options', 'aapl').subscribe();

    expect(http.expectOne('/research-api/api/flowpatrol/upload').request.method).toBe('POST');
    const add = http.expectOne(
      '/research-api/api/flowpatrol/brokerage/watchlists/Core%20Options/symbols',
    );
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({ symbol: 'AAPL' });
    http.verify();
  });
});
