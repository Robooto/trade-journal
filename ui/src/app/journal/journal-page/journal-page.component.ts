// journal-page.component.ts
import {Component, OnInit} from '@angular/core';
import {JournalEntry} from '../journal-entry.model';
import {JournalStorageService} from '../journal-storage.service';
import {JournalApiService} from '../journal-api.service';

@Component({
  selector: 'app-journal-page',
  templateUrl: './journal-page.component.html',
  styleUrls: ['./journal-page.component.scss'],
  standalone: false,
})
export class JournalPageComponent implements OnInit {
  entries: JournalEntry[] = [];
  selectedEntry?: JournalEntry;

  constructor(private api: JournalApiService, private store: JournalStorageService) {}

  ngOnInit() {
    //this.loadEntries();
    this.load();
  }

  load() {
    this.api.list().subscribe(entries => {
      this.entries = entries.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    });
  }

  loadEntries() {
    // oldest→newest; adjust if you want reverse
    this.entries = this.store.getAll().sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  onEntrySelected(entry: JournalEntry) {
    this.selectedEntry = entry;
  }

  onEntrySaved(_entry: JournalEntry) {
    this.selectedEntry = undefined;
    //this.loadEntries();
    this.load();
  }

  onEditCancelled() {
    this.selectedEntry = undefined;
  }
}
