import { Component } from '@angular/core';
import {resources, ResourceLink, dailyGuidelines, tradeGuidelines} from '../dashboard-data';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
  standalone: false,
})
export class DashboardPageComponent {
  resources: ResourceLink[] = resources;
  protected readonly dailyGuidelines = dailyGuidelines;
  protected readonly tradeGuidelines = tradeGuidelines;
}
