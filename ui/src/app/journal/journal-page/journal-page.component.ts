import {Component, OnInit} from '@angular/core';
import {JournalEntry, PaginatedJournalEntries } from '../journal.models';
import {JournalApiService} from '../journal-api.service';

@Component({
  selector: 'app-journal-page',
  templateUrl: './journal-page.component.html',
  styleUrls: ['./journal-page.component.scss'],
  standalone: false,
})
export class JournalPageComponent implements OnInit {
  entries: JournalEntry[] = [];
  totalEntries = 0;
  pageSkip = 0;
  pageLimit = 10;
  selectedEntry?: JournalEntry;
  showForm = false;

  constructor(private api: JournalApiService) {}

  ngOnInit() {
    this.loadNextPage();
  }

  loadNextPage() {
    this.api.list(this.pageSkip, this.pageLimit).subscribe((result: PaginatedJournalEntries) => {
      this.entries = [...this.entries, ...result.items];
      this.totalEntries = result.total;
      this.pageSkip += this.pageLimit;
    });
  }

  toggleForm() {
    this.showForm = !this.showForm;
    if (!this.showForm) {
      this.selectedEntry = undefined;
    }
  }

  onEntrySelected(entry: JournalEntry) {
    this.selectedEntry = entry;
    this.showForm = true;
  }

  onEntrySaved(_entry: JournalEntry) {
    this.selectedEntry = undefined;
    this.showForm = false;
    this.entries = [];
    this.pageSkip = 0;
    this.loadNextPage();
  }

  onEditCancelled() {
    this.selectedEntry = undefined;
    this.showForm = false;
  }

  onEntryDeleted(id: string) {
    this.entries = this.entries.filter(e => e.id !== id);
    this.totalEntries = Math.max(this.totalEntries - 1, 0);
    this.selectedEntry = undefined;
  }
}
