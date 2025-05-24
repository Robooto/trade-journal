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
    this.entries = this.store.getAll();
  }
}
