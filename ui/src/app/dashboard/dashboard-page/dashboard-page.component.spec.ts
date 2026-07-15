import { of } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page.component';
import { dailyOverviewAnalysis, spotGammaToolLinks, dailyGuidelines, tradeGuidelines } from '../dashboard-data';
import { JournalApiService } from '../../journal/journal-api.service';

describe('DashboardPageComponent', () => {
  let component: DashboardPageComponent;

  beforeEach(() => {
    const journalApi = {
      list: () => of({ total: 0, items: [], skip: 0, limit: 3 }),
    } as unknown as JournalApiService;
    component = new DashboardPageComponent(journalApi);
    component.ngOnInit();
  });

  it('should expose links and guidelines', () => {
    expect(component.dailyOverview).toBe(dailyOverviewAnalysis);
    expect(component.spotGammaTools).toBe(spotGammaToolLinks);
    expect(component.dailyGuidelines).toBe(dailyGuidelines);
    expect(component.tradeGuidelines).toBe(tradeGuidelines);
  });
});
