import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { FlowIdeaMetrics } from '../../flow-ideas.models';

@Component({
  selector: 'app-flow-metrics',
  templateUrl: './flow-metrics.component.html',
  styleUrls: ['./flow-metrics.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowMetricsComponent {
  @Input({ required: true }) metrics!: FlowIdeaMetrics;
}
