import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { DashboardPageComponent } from './dashboard-page.component';
import { dailyOverviewAnalysis, spotGammaToolLinks, dailyGuidelines, tradeGuidelines } from '../dashboard-data';
import { JournalApiService } from '../../journal/journal-api.service';

describe('DashboardPageComponent', () => {
  let component: DashboardPageComponent;
  let fixture: ComponentFixture<DashboardPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DashboardPageComponent],
      providers: [{
        provide: JournalApiService,
        useValue: { list: () => of({ total: 0, items: [], skip: 0, limit: 3 }) }
      }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should expose links and guidelines', () => {
    expect(component.dailyOverview).toBe(dailyOverviewAnalysis);
    expect(component.spotGammaTools).toBe(spotGammaToolLinks);
    expect(component.dailyGuidelines).toBe(dailyGuidelines);
    expect(component.tradeGuidelines).toBe(tradeGuidelines);
  });
});
