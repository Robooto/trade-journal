import { Component, OnInit } from '@angular/core';
import { JournalApiService } from '../../journal/journal-api.service';
import { JournalEntry } from '../../journal/journal.models';
import { dailyOverviewAnalysis, spotGammaToolLinks, ResourceLink, dailyGuidelines, tradeGuidelines } from '../dashboard-data';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
  standalone: false,
})
export class DashboardPageComponent implements OnInit {
  dailyOverview: ResourceLink[] = dailyOverviewAnalysis;
  spotGammaTools: ResourceLink[] = spotGammaToolLinks;
  readonly dailyGuidelines = dailyGuidelines;
  readonly tradeGuidelines = tradeGuidelines;
  recentEntries: JournalEntry[] = [];

  constructor(private journalApi: JournalApiService) {}

  ngOnInit(): void {
    this.journalApi.list(0, 3).subscribe({
      next: result => (this.recentEntries = result.items),
      error: () => (this.recentEntries = []),
    });
  }

  openAll(links: ResourceLink[]): void {
    links.slice().reverse().forEach(link => window.open(link.url, '_blank'));
  }
}