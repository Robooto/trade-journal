import { Component } from '@angular/core';
import { LoadingService } from './shared/loading.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false,
})
export class AppComponent {
  view: 'journal' = 'journal';
  loading$ = this.loadingService.loading$;

  constructor(private loadingService: LoadingService) {}
}
