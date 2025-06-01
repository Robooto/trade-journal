import {Component, OnInit} from '@angular/core';
import {JournalEntry} from '../journal-entry.model';
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

  constructor(private api: JournalApiService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.list().subscribe(entries => {
      this.entries = entries.sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    });
  }

  onEntrySelected(entry: JournalEntry) {
    this.selectedEntry = entry;
  }

  onEntrySaved(_entry: JournalEntry) {
    this.selectedEntry = undefined;
    this.load();
  }

  onEditCancelled() {
    this.selectedEntry = undefined;
  }
}
