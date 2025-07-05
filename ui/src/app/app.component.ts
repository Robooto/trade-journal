import { Component } from '@angular/core';
import { LoadingService } from './shared/loading.service';
import { FuturesService } from './shared/futures.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent {
  view: 'journal' = 'journal';
  currentContract: string;
  isCollapsed = false;
  
  get loading$() {
    return this.loadingService.loading$;
  }

  constructor(
    private loadingService: LoadingService,
    private futures: FuturesService
  ) {
    this.currentContract = this.futures.getCurrentESContract();
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }
}
