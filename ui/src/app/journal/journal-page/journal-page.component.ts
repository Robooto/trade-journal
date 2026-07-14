import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription, debounceTime, distinctUntilChanged, finalize, merge } from 'rxjs';
import { JournalEntry, PaginatedJournalEntries } from '../journal.models';
import { JournalApiService } from '../journal-api.service';

@Component({
  selector: 'app-journal-page',
  templateUrl: './journal-page.component.html',
  styleUrls: ['./journal-page.component.scss'],
  standalone: false,
})
export class JournalPageComponent implements OnInit, OnDestroy {
  entries: JournalEntry[] = [];
  totalEntries = 0;
  pageSkip = 0;
  pageLimit = 15;
  selectedEntry?: JournalEntry;
  showForm = false;
  loading = false;
  errorMessage = '';
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly tickerControl = new FormControl('', { nonNullable: true });
  private filterSubscription?: Subscription;

  constructor(
    private api: JournalApiService,
    @Optional() private route?: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.showForm = this.route?.snapshot.queryParamMap.get('new') === '1';
    this.loadNextPage();
    this.filterSubscription = merge(
      this.searchControl.valueChanges,
      this.tickerControl.valueChanges
    ).pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.reload());
  }

  ngOnDestroy(): void {
    this.filterSubscription?.unsubscribe();
  }

  get hasFilters(): boolean {
    return Boolean(this.searchControl.value.trim() || this.tickerControl.value.trim());
  }

  loadNextPage(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.errorMessage = '';
    this.api.list(
      this.pageSkip,
      this.pageLimit,
      this.searchControl.value,
      this.tickerControl.value
    ).pipe(finalize(() => (this.loading = false))).subscribe({
      next: (result: PaginatedJournalEntries) => {
        this.entries = [...this.entries, ...result.items];
        this.totalEntries = result.total;
        this.pageSkip += result.items.length;
      },
      error: error => {
        this.errorMessage = error?.error?.detail || 'Journal entries could not be loaded.';
      },
    });
  }

  reload(): void {
    this.entries = [];
    this.totalEntries = 0;
    this.pageSkip = 0;
    this.loadNextPage();
  }

  clearFilters(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.tickerControl.setValue('', { emitEvent: false });
    this.reload();
  }

  openNewEntry(): void {
    this.selectedEntry = undefined;
    this.showForm = true;
  }

  toggleForm(): void {
    if (this.showForm) {
      this.showForm = false;
      this.selectedEntry = undefined;
    } else {
      this.openNewEntry();
    }
  }

  onEntrySelected(entry: JournalEntry): void {
    this.selectedEntry = entry;
    this.showForm = true;
  }

  onEntrySaved(_entry: JournalEntry): void {
    this.selectedEntry = undefined;
    this.showForm = false;
    this.reload();
  }

  onEditCancelled(): void {
    this.selectedEntry = undefined;
    this.showForm = false;
  }

  onEntryDeleted(id: string): void {
    this.entries = this.entries.filter(entry => entry.id !== id);
    this.totalEntries = Math.max(this.totalEntries - 1, 0);
    this.selectedEntry = undefined;
    this.showForm = false;
  }
}