import { ComponentFixture, TestBed, flushMicrotasks, fakeAsync } from '@angular/core/testing';
import { JournalEntry } from '../journal.models';
import { JournalEntryListComponent } from './journal-entry-list.component';

describe('JournalEntryListComponent', () => {
  let component: JournalEntryListComponent;
  let fixture: ComponentFixture<JournalEntryListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [JournalEntryListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JournalEntryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('copyEntry', () => {
    let entry: JournalEntry;

    beforeEach(() => {
      entry = {
        id: '1',
        date: '2024-01-01',
        esPrice: 5000,
        delta: 10,
        notes: 'testing notes',
        events: [
          { time: '09:30', price: 5000, note: 'open' },
          { time: '10:00', price: 5010, note: 'rally' }
        ],
        marketDirection: 'up'
      };
    });

    it('writes formatted entry to clipboard when available', fakeAsync(() => {
      const writeSpy = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeSpy },
        configurable: true
      });

      component.copyEntry(entry);
      flushMicrotasks();

      expect(writeSpy).toHaveBeenCalled();
      const textArg = writeSpy.calls.mostRecent().args[0] as string;
      expect(textArg).toContain(entry.date);
      expect(textArg).toContain(entry.esPrice.toString());
      expect(textArg).toContain(entry.marketDirection);
      expect(textArg).toContain(entry.delta.toString());
      expect(textArg).toContain(entry.notes);
      expect(textArg).toContain(entry.events[0].note);
    }));

    it('falls back when clipboard API not available', () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      const fallbackSpy = spyOn<any>(component as any, 'fallbackCopy');

      component.copyEntry(entry);

      expect(fallbackSpy).toHaveBeenCalled();
    });
  });

  describe('fallbackCopy', () => {
    it('uses execCommand and cleans up textarea', () => {
      const execSpy = spyOn(document, 'execCommand');
      const initialCount = document.querySelectorAll('textarea').length;

      (component as any)['fallbackCopy']('hello world');

      expect(execSpy).toHaveBeenCalledWith('copy');
      const finalCount = document.querySelectorAll('textarea').length;
      expect(finalCount).toBe(initialCount);
    });
  });
});
