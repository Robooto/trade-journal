import { of, throwError } from 'rxjs';
import { DashboardPageComponent, pacificDate, weekStart } from './dashboard-page.component';
import { dailyOverviewAnalysis, spotGammaToolLinks, dailyGuidelines, tradeGuidelines } from '../dashboard-data';
import { JournalApiService } from '../../journal/journal-api.service';
import { TraceApiService } from '../../trace/overview/data-access/trace-api.service';
import type { JournalEntry } from '../../journal/journal.models';

function policy(id: string, trades: { day: string; status: string; net: number | null }[]) {
  return { id, label: id, summary: {}, versus_reference: null, trades };
}

describe('DashboardPageComponent', () => {
  let component: DashboardPageComponent;
  let traceApi: { researchStatus: ReturnType<typeof vi.fn>; paperBacktestScorecard: ReturnType<typeof vi.fn> };

  function create() {
    const journalApi = { list: () => of({ total: 0, items: [], skip: 0, limit: 3 }) } as unknown as JournalApiService;
    component = new DashboardPageComponent(journalApi, traceApi as unknown as TraceApiService);
    component.ngOnInit();
  }

  beforeEach(() => {
    localStorage.clear();
    traceApi = {
      researchStatus: vi.fn(() => of({ headline: 'Distance and time carry the signal.' })),
      paperBacktestScorecard: vi.fn(() => of({ policies: [
        policy('recorded-rules', [{ day: '2000-01-03', status: 'closed', net: 500 }, { day: '2999-01-04', status: 'closed', net: 40 },
          { day: '2999-01-04', status: 'censored', net: null }]),
        policy('H1-hold', [{ day: '2999-01-04', status: 'closed', net: 90 }, { day: '2999-01-05', status: 'closed', net: -30 }]),
        policy('H4-target-75-no-stop', [{ day: '2999-01-04', status: 'closed', net: 75 }])] })),
    };
    create();
  });

  it('should expose links and guidelines', () => {
    expect(component.dailyOverview).toBe(dailyOverviewAnalysis);
    expect(component.spotGammaTools).toBe(spotGammaToolLinks);
    expect(component.dailyGuidelines).toBe(dailyGuidelines);
    expect(component.tradeGuidelines).toBe(tradeGuidelines);
  });

  it('shows the research headline and this week for the live bot and the same entries held to expiry', () => {
    expect(traceApi.paperBacktestScorecard).toHaveBeenCalled();
    expect(component.researchHeadline).toBe('Distance and time carry the signal.');
    expect(component.deskRows).toEqual([
      { id: 'recorded-rules', label: 'Paper bot (live rules)', net: 40, closes: 1 },
      { id: 'H1-hold', label: 'Same entries, held to expiry', net: 60, closes: 2 },
    ]);
    expect(component.deskTrackedCount).toBe(3);
    expect(component.deskStatus).toBe('ready');
    traceApi.paperBacktestScorecard.mockReturnValue(throwError(() => new Error('down')));
    create();
    expect(component.deskStatus).toBe('unavailable');
  });

  it('keeps the checklist for today in this browser and drops earlier days', () => {
    localStorage.setItem('dashboard-checklist:2020-01-01', '[1]');
    create();
    component.toggleCheck(2);
    component.toggleCheck(4);
    component.toggleCheck(2);
    expect(component.isChecked(4) && !component.isChecked(2)).toBe(true);
    create();
    expect(component.checkedCount).toBe(1);
    expect(localStorage.getItem('dashboard-checklist:2020-01-01')).toBeNull();
  });

  it('computes Pacific dates, week starts and plain note previews', () => {
    expect(pacificDate(new Date('2026-10-17T05:00:00Z'))).toBe('2026-10-16');
    expect(weekStart('2026-10-17')).toBe('2026-10-12');
    expect(weekStart('2026-10-12')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    const entry = { notes: '<p>**Bullish** above 6700</p>' + 'x'.repeat(100) } as JournalEntry;
    expect(component.notePreview(entry).startsWith('Bullish above 6700')).toBe(true);
    expect(component.notePreview(entry).length).toBe(90);
  });
});
