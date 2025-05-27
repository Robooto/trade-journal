// src/app/journal-entry-form/journal-entry-form.component.ts
import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {
  FormBuilder,
  FormArray,
  FormGroup,
  Validators
} from '@angular/forms';
import { v4 as uuid } from 'uuid';
import { JournalStorageService } from '../journal-storage.service';
import { JournalEntry } from '../journal-entry.model';
import {JournalApiService} from '../journal-api.service';

@Component({
  selector: 'app-journal-entry-form',
  templateUrl: './journal-entry-form.component.html',
  styleUrls: ['./journal-entry-form.component.scss'],
  standalone: false,
})
export class JournalEntryFormComponent implements OnInit, OnChanges  {
  @Input() entry?: JournalEntry;
  @Output() saved = new EventEmitter<JournalEntry>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private store: JournalStorageService,
    private api: JournalApiService
  ) {}

  ngOnInit() {
    this.buildForm();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['entry']) {
      if (this.entry) {
        // patch existing
        this.form.patchValue({
          date: this.entry.date,
          esPrice: this.entry.esPrice,
          delta: this.entry.delta,
          marketDirection: this.entry.marketDirection,
          notes: this.entry.notes
        });
        // rebuild events array
        const arr = this.form.get('events') as FormArray;
        arr.clear();
        this.entry.events.forEach(ev =>
          arr.push(this.fb.group({
            time: [ev.time, Validators.required],
            price: [ev.price, Validators.required],
            note: [ev.note]
          }))
        );
      } else {
        // reset to blank
        this.resetForm();
      }
    }
  }

  get events() {
    return this.form.get('events') as FormArray;
  }

  buildForm() {
    this.form = this.fb.group({
      date: [
        new Date().toISOString().substring(0, 10), Validators.required
      ],
      esPrice: [null, Validators.required],
      delta: [null, Validators.required],
      marketDirection: ['up' as const, Validators.required],
      notes: [''],
      events: this.fb.array([]),
    });
  }

  resetForm() {
    this.buildForm();
  }

  addEvent() {
    this.events.push(this.fb.group({
      time: [new Date().toLocaleTimeString(), Validators.required],
      price: [null, Validators.required],
      note: ['']
    }));
  }

  submit() {
    if (this.form.invalid) return;

    const formValue = this.form.value;
    //let all = this.store.getAll();
    //let savedEntry: JournalEntry;

    //if (this.entry) {
    //  savedEntry = {
    //    id: this.entry.id,
    //    ...formValue
    //  };
    //  all = all.map(e => e.id === this.entry!.id ? savedEntry : e);
    //} else {
    //  savedEntry = {
    //    id: uuid(),
    //    ...formValue
    //  };
    //  all = [...all, savedEntry];
    //}
    //this.store.save(all);
    //this.saved.emit(savedEntry);

    if (this.entry) {
      const updated: JournalEntry = { id: this.entry.id, ...formValue };
      this.api.update(updated).subscribe(e => this.saved.emit(e));
    } else {
      this.api.create(formValue).subscribe(e => this.saved.emit(e));
    }

  }

  cancel() {
    this.resetForm();            // clear out the controls
    this.cancelled.emit();       // let the parent know
  }
}
