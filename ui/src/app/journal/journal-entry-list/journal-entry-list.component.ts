// src/app/journal-entry-list/journal-entry-list.component.ts
import { Component, OnInit } from '@angular/core';
import { JournalEntry } from '../journal-entry.model';
import { JournalStorageService } from '../journal-storage.service';

@Component({
  selector: 'app-journal-entry-list',
  templateUrl: './journal-entry-list.component.html',
  standalone: false,
})
export class JournalEntryListComponent implements OnInit {
  entries: JournalEntry[] = [];

  constructor(private store: JournalStorageService) {}

  ngOnInit() {
    const all = this.store.getAll();

    // Sort by date ascending (oldest first, newest last)
    this.entries = all.sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

}
