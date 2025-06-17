import { Component } from '@angular/core';
import {dailyOverviewAnalysis, spotGammaToolLinks, ResourceLink, dailyGuidelines, tradeGuidelines} from '../dashboard-data';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
  standalone: false,
})
export class DashboardPageComponent {
  dailyOverview: ResourceLink[] = dailyOverviewAnalysis;
  spotGammaTools: ResourceLink[] = spotGammaToolLinks;
  readonly dailyGuidelines = dailyGuidelines;
  readonly tradeGuidelines = tradeGuidelines;

  openAll(links: ResourceLink[]): void {
    links.forEach(link => window.open(link.url, '_blank'));
  }
}
