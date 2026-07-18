import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

import {
  FlowIdeasServerFilters,
  FlowReportDate,
} from '../../flow-ideas.models';

export interface FlowChangeOption {
  readonly value: string;
  readonly label: string;
}

@Component({
  selector: 'app-flow-filters',
  templateUrl: './flow-filters.component.html',
  styleUrls: ['./flow-filters.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class FlowFiltersComponent implements OnChanges {
  @Input({ required: true }) serverFilters!: FlowIdeasServerFilters;
  @Input({ required: true }) includeIndexEtfs!: boolean;
  @Input() dates: readonly FlowReportDate[] = [];
  @Input() datesLoading = false;
  @Input() eventOptions: readonly FlowChangeOption[] = [];

  @Output() readonly dateChange = new EventEmitter<string>();
  @Output() readonly symbolInput = new EventEmitter<string>();
  @Output() readonly eventChange = new EventEmitter<string>();
  @Output() readonly activeOnlyChange = new EventEmitter<boolean>();
  @Output() readonly universeChange = new EventEmitter<boolean>();

  symbolValue = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['serverFilters']) {
      this.symbolValue = this.serverFilters.symbol;
    }
  }

  onSymbolInput(event: Event): void {
    this.symbolValue = valueFromEvent(event);
    this.symbolInput.emit(this.symbolValue);
  }

  trackDate(_: number, date: FlowReportDate): string {
    return date.trading_date;
  }
}

function valueFromEvent(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
