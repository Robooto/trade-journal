import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, debounceTime, finalize } from 'rxjs';
import {
  JournalEntry,
  JournalEntryPrefill,
} from '../journal.models';
import { JournalApiService } from '../journal-api.service';
import { JournalDraftService } from '../journal-draft.service';
import { FuturesService } from '../../shared/futures.service';

@Component({
  selector: 'app-journal-entry-form',
  templateUrl: './journal-entry-form.component.html',
  styleUrls: ['./journal-entry-form.component.scss'],
  standalone: false,
})
export class JournalEntryFormComponent implements OnInit, OnChanges, OnDestroy {
  @Input() entry?: JournalEntry;
  @Input() prefill?: JournalEntryPrefill;
  @Output() saved = new EventEmitter<JournalEntry>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<string>();

  form!: FormGroup;
  showTimelineSection = false;
  draftRestored = false;
  draftSavedAt?: Date;
  isSaving = false;
  saveError = '';
  private draftSubscription?: Subscription;

  constructor(
    private fb: FormBuilder,
    private api: JournalApiService,
    private drafts: JournalDraftService,
    private futures: FuturesService
  ) {}

  ngOnInit(): void {
    this.buildForm();
    if (this.entry) {
      this.populateFormWithEntry();
      return;
    }

    const restored = this.restoreDraft();
    this.applyPrefill();
    if (!restored || !this.form.get('esPrice')?.value) {
      this.loadOpeningMarketContext();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes['entry']) {
      if (this.entry) {
        this.populateFormWithEntry();
      } else {
        this.resetForm();
        this.restoreDraft();
      }
    }
    if (changes['prefill']) {
      this.applyPrefill();
    }
  }

  ngOnDestroy(): void {
    if (this.form && !this.form.get('id')?.value && this.form.dirty) {
      this.persistDraft();
    }
    this.draftSubscription?.unsubscribe();
  }

  get events(): FormArray {
    return this.form.get('events') as FormArray;
  }

  buildForm(): void {
    this.draftSubscription?.unsubscribe();
    this.form = this.fb.group({
      id: [null],
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      esPrice: [null, Validators.required],
      delta: [null],
      marketDirection: [null, Validators.required],
      tickers: [''],
      sourceLabel: [''],
      sourceUrl: [''],
      notes: [''],
      events: this.fb.array([]),
    });
    this.draftSubscription = this.form.valueChanges.pipe(debounceTime(600)).subscribe(() => {
      if (!this.form.get('id')?.value && this.form.dirty) {
        this.persistDraft();
      }
    });
  }

  private restoreDraft(): boolean {
    const draft = this.drafts.load<Record<string, any>>();
    if (!draft?.value) {
      return false;
    }
    this.applyFormValue(draft.value);
    this.draftRestored = true;
    this.draftSavedAt = new Date(draft.savedAt);
    return true;
  }

  private persistDraft(): void {
    const draft = this.drafts.save(this.form.getRawValue());
    this.draftSavedAt = new Date(draft.savedAt);
  }

  clearDraft(): void {
    this.drafts.clear();
    this.draftRestored = false;
    this.draftSavedAt = undefined;
    this.resetForm();
    this.loadOpeningMarketContext();
  }

  private populateFormWithEntry(): void {
    if (!this.entry || !this.form) {
      return;
    }
    this.applyFormValue({
      ...this.entry,
      tickers: (this.entry.tickers ?? []).join(', '),
    });
    this.form.markAsPristine();
    this.draftRestored = false;
    this.draftSavedAt = undefined;
  }

  private applyFormValue(value: Record<string, any>): void {
    this.form.patchValue({
      id: value['id'] ?? null,
      date: value['date'] ?? new Date().toISOString().substring(0, 10),
      esPrice: value['esPrice'] ?? null,
      delta: value['delta'] ?? null,
      marketDirection: value['marketDirection'] ?? null,
      tickers: Array.isArray(value['tickers']) ? value['tickers'].join(', ') : (value['tickers'] ?? ''),
      sourceLabel: value['sourceLabel'] ?? '',
      sourceUrl: value['sourceUrl'] ?? '',
      notes: value['notes'] ?? '',
    }, { emitEvent: false });

    this.events.clear();
    for (const event of value['events'] ?? []) {
      this.events.push(this.fb.group({
        time: [event.time, Validators.required],
        price: [event.price, Validators.required],
        note: [event.note ?? ''],
      }));
    }
    this.showTimelineSection = this.events.length > 0;
  }

  private applyPrefill(): void {
    if (!this.prefill) {
      return;
    }
    const tickers = this.normalizeTickers([
      ...this.normalizeTickers(this.form.get('tickers')?.value),
      ...(this.prefill.tickers ?? []),
    ]);
    const currentNotes = String(this.form.get('notes')?.value ?? '').trim();
    const importedNotes = this.prefill.notes?.trim() ?? '';
    const notes = importedNotes && !currentNotes.includes(importedNotes)
      ? [currentNotes, importedNotes].filter(Boolean).join('\n\n')
      : currentNotes;

    this.form.patchValue({
      tickers: tickers.join(', '),
      sourceLabel:
        this.form.get('sourceLabel')?.value || this.prefill.sourceLabel || '',
      sourceUrl:
        this.form.get('sourceUrl')?.value || this.prefill.sourceUrl || '',
      notes,
    });
    this.form.markAsDirty();
  }

  private loadOpeningMarketContext(): void {
    const symbol = this.futures.getCurrentESContract();
    this.api.getMarketData([], [], [symbol], []).subscribe({
      next: data => {
        if (!data?.length) {
          return;
        }
        const item = data[0];
        const mark = Number.parseFloat(item['mark']);
        const open = Number.parseFloat(item['open'] ?? item['close']);
        if (Number.isFinite(mark)) {
          this.form.patchValue({ esPrice: Math.trunc(mark) });
        }
        if (Number.isFinite(mark) && Number.isFinite(open)) {
          this.form.patchValue({ marketDirection: mark >= open ? 'up' : 'down' });
        }
      },
      error: () => {
        if (!this.form.get('marketDirection')?.value) {
          this.form.patchValue({ marketDirection: 'up' });
        }
      },
    });
  }

  resetForm(): void {
    this.buildForm();
    this.showTimelineSection = false;
    this.saveError = '';
  }

  toggleTimelineSection(): void {
    this.showTimelineSection = !this.showTimelineSection;
    if (this.showTimelineSection && this.events.length === 0) {
      this.addEvent();
    }
  }

  addEvent(): void {
    const group = this.fb.group({
      time: [new Date().toLocaleTimeString(), Validators.required],
      price: this.fb.control<number | null>(null, Validators.required),
      note: [''],
    });
    this.events.push(group);
    this.form.markAsDirty();

    const symbol = this.futures.getCurrentESContract();
    this.api.getMarketData([], [], [symbol], []).subscribe(data => {
      const mark = Number.parseFloat(data?.[0]?.['mark']);
      if (Number.isFinite(mark)) {
        group.patchValue({ price: Math.trunc(mark) });
      }
    });
  }

  submit(): void {
    if (this.form.invalid || this.isSaving) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.saveError = '';
    const value = this.form.getRawValue();
    const tickers = this.normalizeTickers(value.tickers);
    const request = value.id
      ? this.api.update({ ...value, id: value.id, tickers } as JournalEntry)
      : this.api.create({
          date: value.date,
          esPrice: value.esPrice,
          delta: value.delta,
          marketDirection: value.marketDirection,
          notes: value.notes,
          events: value.events,
          tickers,
          sourceLabel: value.sourceLabel?.trim() || null,
          sourceUrl: value.sourceUrl?.trim() || null,
        });
    request.pipe(finalize(() => (this.isSaving = false))).subscribe({
      next: entry => {
        this.drafts.clear();
        this.form.patchValue({ id: entry.id }, { emitEvent: false });
        this.saved.emit(entry);
      },
      error: error => {
        this.saveError = error?.error?.detail || 'The journal entry could not be saved.';
      },
    });
  }

  cancel(): void {
    this.resetForm();
    this.cancelled.emit();
  }

  confirmDelete(): void {
    const id = this.form.get('id')?.value;
    if (!id || !confirm('Delete this entry?')) {
      return;
    }
    this.api.delete(id).subscribe(() => {
      this.deleted.emit(id);
      this.resetForm();
    });
  }

  private normalizeTickers(value: string | string[] | null | undefined): string[] {
    const values = Array.isArray(value) ? value : (value ?? '').split(',');
    return [...new Set(values.map(ticker => ticker.trim().toUpperCase()).filter(Boolean))];
  }
}