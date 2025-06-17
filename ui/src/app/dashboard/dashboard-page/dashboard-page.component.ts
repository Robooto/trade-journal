import { Component } from '@angular/core';
import { guidelines, resources, ResourceLink } from '../dashboard-data';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard-page.component.html',
  styleUrls: ['./dashboard-page.component.scss'],
  standalone: false,
})
export class DashboardPageComponent {
  guidelines = guidelines;
  resources: ResourceLink[] = resources;
}
