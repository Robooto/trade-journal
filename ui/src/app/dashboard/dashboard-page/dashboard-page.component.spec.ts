import { of, throwError } from 'rxjs';
import { DashboardPageComponent, pacificDate, weekStart } from './dashboard-page.component';
import { dailyOverviewAnalysis, spotGammaToolLinks, dailyGuidelines, tradeGuidelines } from '../dashboard-data';
import { JournalApiService } from '../../journal/journal-api.service';
import { TraceApiService } from '../../trace/overview/data-access/trace-api.service';
import type { JournalEntry } from '../../journal/journal.models';

function arm(arm_id: string, kind: string, net: number) {
  return { arm_id, policy_id: 'p', label: arm_id, kind, start_date: '2026-09-22', end_date: null, closes: 3, sessions: 1,
    net_dollars: net, net_per_close: net / 3, win_rate: 0.5, required_sessions: null, required_closes: null, status: 'control' };
}

describe('DashboardPageComponent', () => {
  let component: DashboardPageComponent;
  let traceApi: { researchStatus: ReturnType<typeof vi.fn>; paperArms: ReturnType<typeof vi.fn> };

  function create() {
    const journalApi = { list: () => of({ total: 0, items: [], skip: 0, limit: 3 }) } as unknown as JournalApiService;
    component = new DashboardPageComponent(journalApi, traceApi as unknown as TraceApiService);
    component.ngOnInit();
  }

  beforeEach(() => {
    localStorage.clear();
    traceApi = {
      researchStatus: vi.fn(() => of({ headline: 'Distance and time carry the signal.' })),
      paperArms: vi.fn(() => of({ arms: [arm('credit-risk-to-close.v4:baseline', 'baseline', -120), arm('rotation-C0', 'rotation', 10),
        arm('negative-pocket-shadow', 'shadow', 22)] })),
    };
    create();
  });

  it('should expose links and guidelines', () => {
    expect(component.dailyOverview).toBe(dailyOverviewAnalysis);
    expect(component.spotGammaTools).toBe(spotGammaToolLinks);
    expect(component.dailyGuidelines).toBe(dailyGuidelines);
    expect(component.tradeGuidelines).toBe(tradeGuidelines);
  });

  it('shows the research headline and this week for the bot and the negative-pocket test', () => {
    expect(traceApi.paperArms).toHaveBeenCalledWith(component.today, component.weekFrom);
    expect(component.researchHeadline).toBe('Distance and time carry the signal.');
    expect(component.deskArms.map(a => a.arm_id)).toEqual(['credit-risk-to-close.v4:baseline', 'negative-pocket-shadow']);
    expect(component.deskTrackedCount).toBe(3);
    expect(component.deskStatus).toBe('ready');
    traceApi.paperArms.mockReturnValue(throwError(() => new Error('down')));
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
