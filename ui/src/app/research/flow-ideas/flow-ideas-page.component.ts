import { Component } from '@angular/core';

@Component({
  selector: 'app-flow-ideas-page',
  templateUrl: './flow-ideas-page.component.html',
  styleUrls: ['./flow-ideas-page.component.scss'],
  standalone: false,
})
export class FlowIdeasPageComponent {
  /**
   * The same-origin Research proxy reaches the mini while keeping its address
   * out of compiled Angular source.
   */
  readonly traceUrl = '/research-api/';
}
