
import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {
  FormBuilder,
  FormArray,
  FormGroup,
  Validators
} from '@angular/forms';
import { JournalEntry } from '../journal.models';
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
  @Output() deleted = new EventEmitter<string>();

  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
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
          id: this.entry.id,
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
      id: [null],
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

    const formValue : JournalEntry = this.form.value;

    if (formValue.id) {
      this.api.update(formValue).subscribe(e => this.saved.emit(e));
    } else {
      this.api.create(formValue).subscribe(e => {
        this.form.patchValue({ id: e.id });
        this.saved.emit(e);
      });
    }

  }

  cancel() {
    this.resetForm();
    this.cancelled.emit();
  }

  confirmDelete() {
    const id = this.form.get('id')?.value;
    if (!id) return;

    if (confirm('Delete this entry?')) {
      this.api.delete(id).subscribe(() => {
        this.deleted.emit(id);
        this.resetForm();
      });
    }
  }
}
