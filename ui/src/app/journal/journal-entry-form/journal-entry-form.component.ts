
import {Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import {
  FormBuilder,
  FormArray,
  FormGroup,
  Validators
} from '@angular/forms';
import { JournalEntry } from '../journal.models';
import {JournalApiService} from '../journal-api.service';
import { FuturesService } from '../../shared/futures.service';

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
    private api: JournalApiService,
    private futures: FuturesService
  ) {}

  ngOnInit() {
    this.buildForm();

    const symbol = this.futures.getCurrentESContract();
    this.api
      .getMarketData([], [], [symbol], [])
      .subscribe((data) => {
        if (!data || !data.length) return;
        const item = data[0];
        const mark = parseFloat(item['mark']);
        const open = parseFloat(item['open']);
        if (!isNaN(mark)) {
          this.form.patchValue({ esPrice: parseInt(String(mark), 10) });
        }
        if (!isNaN(mark) && !isNaN(open)) {
          this.form.patchValue({
            marketDirection: mark > open ? 'up' : 'down'
          });
        }
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['entry']) {
      if (this.entry) {
        // patch existing
        this.form.patchValue({
          id: this.entry.id,
          date: this.entry.date,
          esPrice: this.entry.esPrice,
          delta: this.entry.delta ?? null,
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
      delta: [null],
      marketDirection: ['up' as const, Validators.required],
      notes: [''],
      events: this.fb.array([]),
    });
  }

  resetForm() {
    this.buildForm();
  }

  addEvent() {
    const group = this.fb.group({
      time: [new Date().toLocaleTimeString(), Validators.required],
      price: [null, Validators.required],
      note: ['']
    });
    this.events.push(group);

    const symbol = this.futures.getCurrentESContract();
    this.api
      .getMarketData([], [], [symbol], [])
      .subscribe((data) => {
        if (!data || !data.length) return;
        const item = data[0];
        const mark = parseFloat(item['mark']);
        if (!isNaN(mark)) {
          group.patchValue({ price: parseInt(String(mark), 10) as any });
        }
      });
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
