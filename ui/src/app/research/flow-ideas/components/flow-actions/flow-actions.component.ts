import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FlowActionSummary } from '../../flow-ideas.models';

@Component({
  selector: 'app-flow-actions',
  templateUrl: './flow-actions.component.html',
  styleUrls: ['./flow-actions.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowActionsComponent {
  @Input() summary: FlowActionSummary | null | undefined = null;
  @Input() compact = false;
}
