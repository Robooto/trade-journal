// src/app/journal-entry-form/journal-entry-form.component.ts
import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormArray,
  FormGroup,
  Validators
} from '@angular/forms';
import { v4 as uuid } from 'uuid';
import { JournalStorageService } from '../journal-storage.service';
import { JournalEntry } from '../journal-entry.model';

@Component({
  selector: 'app-journal-entry-form',
  templateUrl: './journal-entry-form.component.html',
  standalone: false,
})
export class JournalEntryFormComponent implements OnInit {
  form!: FormGroup;   // <-- declare without initializer

  constructor(
    private fb: FormBuilder,
    private store: JournalStorageService
  ) {}

  ngOnInit() {
    this.form = this.fb.group({
      date: [
        new Date().toISOString().substring(0, 10),
        Validators.required
      ],
      esPrice: [null, Validators.required],
      delta: [null, Validators.required],
      notes: [''],
      events: this.fb.array([]),
    });
  }

  get events(): FormArray {
    return this.form.get('events') as FormArray;
  }

  addEvent() {
    this.events.push(
      this.fb.group({
        time: [
          new Date().toLocaleTimeString(),
          Validators.required
        ],
        price: [null, Validators.required],
        note: [''],
      })
    );
  }

  submit() {
    if (this.form.invalid) {
      return;
    }

    // pull out the typed values
    const {
      date,
      esPrice,
      delta,
      notes,
      events
    } = this.form.value;

    const entry: JournalEntry = {
      id: uuid(),
      // because we used Validators.required,
      // we can assert these non-nullable:
      date: date!,
      esPrice: esPrice!,
      delta: delta!,
      notes: notes ?? '',
      // and events is already the right shape
      events: events as JournalEntry['events'],
    };

    const all = this.store.getAll();
    this.store.save([entry, ...all]);

    // reset
    this.form.reset({
      date: new Date().toISOString().substring(0, 10),
      esPrice: null,
      delta: null,
      notes: '',
      events: [],
    });
  }
}
