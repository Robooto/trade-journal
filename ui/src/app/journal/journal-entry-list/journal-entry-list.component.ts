// src/app/journal-entry-list/journal-entry-list.component.ts
import {Component, EventEmitter, Input, Output} from '@angular/core';
import { JournalEntry } from '../journal.models';

@Component({
  selector: 'app-journal-entry-list',
  templateUrl: './journal-entry-list.component.html',
  styleUrls: ['./journal-entry-list.component.scss'],
  standalone: false,
})
export class JournalEntryListComponent {

  @Input() entries: JournalEntry[] = [];
  @Output() entrySelected = new EventEmitter<JournalEntry>();

  onPanelOpen(entry: JournalEntry) {
    this.entrySelected.emit(entry);
  }

  copyEntry(entry: JournalEntry) {
    const deltaStr = entry.delta !== undefined && entry.delta !== null ? entry.delta : 'n/a';
    let text = `${entry.date} - ES ${entry.esPrice} - ${entry.marketDirection} (My account's delta ${deltaStr})\n`;

    // 2) Add the main notes
    text += `Notes: ${entry.notes}\n`;

    if (entry.events && entry.events.length) {
      text += `Events:\n`;
      for (const ev of entry.events) {
        text += `  • ${ev.time} @ ${ev.price} → ${ev.note}\n`;
      }
    }

    // 4) Finally, write to the clipboard (modern browsers only)
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          console.log('Entry copied to clipboard!');
        })
        .catch((err) => {
          console.error('Failed to copy to clipboard:', err);
        });
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(str: string) {
    const txt = document.createElement('textarea');
    txt.style.position = 'fixed';
    txt.style.opacity = '0';
    txt.value = str;
    document.body.appendChild(txt);
    txt.select();

    try {
      document.execCommand('copy');
      console.log('Entry copied via fallback!');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    } finally {
      document.body.removeChild(txt);
    }
  }

}
