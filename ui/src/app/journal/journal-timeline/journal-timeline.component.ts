import { Component, Input, Output, EventEmitter } from '@angular/core';
import { JournalEntry } from '../journal.models';

@Component({
  selector: 'app-journal-timeline',
  templateUrl: './journal-timeline.component.html',
  styleUrls: ['./journal-timeline.component.scss'],
  standalone: false,
})
export class JournalTimelineComponent {
  @Input() entries: JournalEntry[] = [];
  @Output() entrySelected = new EventEmitter<JournalEntry>();

  onEditEntry(entry: JournalEntry) {
    this.entrySelected.emit(entry);
  }

  copyEntry(entry: JournalEntry) {
    const text = this.formatEntryForCopy(entry);
    navigator.clipboard.writeText(text);
  }

  private formatEntryForCopy(entry: JournalEntry): string {
    let text = `${entry.date} - ES ${entry.esPrice} ${entry.marketDirection === 'up' ? 'up' : 'down'}`;
    if (entry.delta !== undefined && entry.delta !== null) {
      text += ` - Delta: ${entry.delta}`;
    }
    if (entry.tickers?.length) {
      text += ` - Tickers: ${entry.tickers.join(', ')}`;
    }
    text += `\n\n${entry.notes}`;
    if (entry.sourceUrl) {
      text += `\nContext: ${entry.sourceLabel || entry.sourceUrl} - ${entry.sourceUrl}`;
    }
    if (entry.events?.length) {
      text += '\n\nIntraday Events:';
      entry.events.forEach(event => {
        text += `\n${event.time} @ ${event.price} - ${event.note}`;
      });
    }
    return text;
  }

  getMarketDirectionIcon(direction: 'up' | 'down'): string {
    return direction === 'up' ? 'trending_up' : 'trending_down';
  }

  getMarketDirectionClass(direction: 'up' | 'down'): string {
    return direction === 'up' ? 'market-up' : 'market-down';
  }

  trackByFn(index: number, item: JournalEntry): any {
    return item.id || index;
  }
}