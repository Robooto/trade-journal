import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { FlowBrokerageContext } from '../../flow-ideas.models';

@Component({
  selector: 'app-brokerage-context',
  templateUrl: './brokerage-context.component.html',
  styleUrls: ['./brokerage-context.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class BrokerageContextComponent {
  @Input() context: FlowBrokerageContext | null = null;
  @Input() unavailableMessage =
    'Brokerage context was not supplied for this deep link. FlowPatrol evidence remains available.';

  formatPercent(value: number | null | undefined): string {
    return value == null ? 'Unavailable' : `${value.toFixed(1)}%`;
  }

  formatNumber(value: number | null | undefined): string {
    return value == null ? 'Unavailable' : value.toLocaleString('en-US');
  }
}
