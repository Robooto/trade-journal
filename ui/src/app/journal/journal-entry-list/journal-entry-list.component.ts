// src/app/journal-entry-list/journal-entry-list.component.ts
import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import { JournalEntry } from '../journal-entry.model';

@Component({
  selector: 'app-journal-entry-list',
  templateUrl: './journal-entry-list.component.html',
  styleUrls: ['./journal-entry-list.component.scss'],
  standalone: false,
})
export class JournalEntryListComponent implements OnInit {

  @Input() entries: JournalEntry[] = [];
  @Output() entrySelected = new EventEmitter<JournalEntry>();

  onPanelOpen(entry: JournalEntry) {
    this.entrySelected.emit(entry);
  }

  ngOnInit(): void {
  }

}
