
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
  showTimelineSection = false;

  constructor(
    private fb: FormBuilder,
    private api: JournalApiService,
    private futures: FuturesService
  ) {}

  ngOnInit() {
    this.buildForm();

    // Populate form with entry data if available
    if (this.entry) {
      this.populateFormWithEntry();
    } else {
      // Only load market data if this is a new entry (no existing entry)
      const symbol = this.futures.getCurrentESContract();
      this.api
        .getMarketData([], [], [symbol], [])
        .subscribe({
          next: (data) => {
            if (!data || !data.length) {
              console.warn('No market data received');
              return;
            }
            const item = data[0];
            
            // Validate market data fields exist
            if (!item.hasOwnProperty('mark') || !item.hasOwnProperty('open')) {
              console.warn('Market data missing required fields (mark/open)');
              return;
            }
            
            const mark = parseFloat(item['mark']);
            const open = parseFloat(item['open']);
            
            if (!isNaN(mark)) {
              this.form.patchValue({ esPrice: parseInt(String(mark), 10) });
            }
            
            if (!isNaN(mark) && !isNaN(open)) {
              let direction: 'up' | 'down';
              if (mark > open) {
                direction = 'up';
              } else if (mark < open) {
                direction = 'down';
              } else {
                // When mark === open, default to 'up' but this could be configurable
                direction = 'up';
              }
              this.form.patchValue({ marketDirection: direction });
            }
          },
          error: (error) => {
            console.error('Failed to load market data:', error);
            // Set a default direction when API fails
            this.form.patchValue({ marketDirection: 'up' });
          }
        });
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['entry'] && this.form) {
      if (this.entry) {
        this.populateFormWithEntry();
      } else {
        // reset to blank
        this.resetForm();
      }
    }
  }

  get events() {
    return this.form.get('events') as FormArray;
  }

  private populateFormWithEntry() {
    if (!this.entry || !this.form) return;
    
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
    if (this.entry.events && this.entry.events.length > 0) {
      this.entry.events.forEach(ev =>
        arr.push(this.fb.group({
          time: [ev.time, Validators.required],
          price: [ev.price, Validators.required],
          note: [ev.note]
        }))
      );
      // Show timeline section if entry has events
      this.showTimelineSection = true;
    } else {
      this.showTimelineSection = false;
    }
  }

  buildForm() {
    this.form = this.fb.group({
      id: [null],
      date: [
        new Date().toISOString().substring(0, 10), Validators.required
      ],
      esPrice: [null, Validators.required],
      delta: [null],
      marketDirection: [null, Validators.required],
      notes: [''],
      events: this.fb.array([]),
    });
  }

  resetForm() {
    this.buildForm();
    this.showTimelineSection = false;
  }

  toggleTimelineSection() {
    this.showTimelineSection = !this.showTimelineSection;
    if (this.showTimelineSection && this.events.length === 0) {
      this.addEvent();
    }
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
