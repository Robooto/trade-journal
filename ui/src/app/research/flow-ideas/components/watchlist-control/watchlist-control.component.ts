import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';

import { FlowBrokerageContext, FlowWatchlistAddResponse, FlowWatchlistsResponse } from '../../flow-ideas.models';

@Component({
  selector: 'app-flow-watchlist-control',
  templateUrl: './watchlist-control.component.html',
  styleUrls: ['./watchlist-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class WatchlistControlComponent {
  private readonly watchlistsValue = signal<FlowWatchlistsResponse | null>(null);
  private readonly contextValue = signal<FlowBrokerageContext | null>(null);
  private readonly symbolValue = signal('');

  @Input() set watchlists(value: FlowWatchlistsResponse | null) { this.watchlistsValue.set(value); }
  @Input() set context(value: FlowBrokerageContext | null) { this.contextValue.set(value); }
  @Input() set symbol(value: string) { this.symbolValue.set(value); }
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() adding = false;
  @Input() result: FlowWatchlistAddResponse | null = null;
  @Input() resultError: string | null = null;
  @Output() readonly addRequested = new EventEmitter<string>();

  readonly available = computed(() => {
    const contextNames = new Set(
      this.contextValue()?.watchlists.map(item => item.name.toUpperCase()) ?? [],
    );
    const symbol = this.symbolValue().trim().toUpperCase();
    return (this.watchlistsValue()?.watchlists ?? []).filter(list =>
      !contextNames.has(list.name.toUpperCase()) &&
      !list.symbols.some(item => item.trim().toUpperCase() === symbol),
    );
  });

  selectedName = '';

  requestAdd(): void {
    if (!this.selectedName || this.adding) return;
    const watchlistName = this.selectedName;
    this.selectedName = '';
    this.addRequested.emit(watchlistName);
  }

  symbolLabel(): string {
    return this.symbolValue();
  }
}
