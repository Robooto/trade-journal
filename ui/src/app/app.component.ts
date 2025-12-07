import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { LoadingService } from './shared/loading.service';
import { FuturesService } from './shared/futures.service';
import { PivotLevel, PivotTrackerService } from './pivot-tracker/pivot-tracker.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  view: 'journal' = 'journal';
  currentContract: string;
  isCollapsed = false;
  pivot$!: Observable<PivotLevel | null>;
  
  get loading$() {
    return this.loadingService.loading$;
  }

  constructor(
    private loadingService: LoadingService,
    private futures: FuturesService,
    private pivotTracker: PivotTrackerService
  ) {
    this.currentContract = this.futures.getCurrentESContract();
    this.pivot$ = this.pivotTracker.latest$;
  }

  ngOnInit(): void {
    this.pivotTracker.loadLatest().subscribe({
      error: err => {
        if (err?.status === 404) {
          this.pivotTracker.setLatest(null);
        }
      },
    });
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }
}
