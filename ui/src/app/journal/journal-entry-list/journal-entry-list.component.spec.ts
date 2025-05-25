import { ComponentFixture, TestBed } from '@angular/core/testing';

import { JournalEntryListComponent } from './journal-entry-list.component';

describe('JournalEntryListComponent', () => {
  let component: JournalEntryListComponent;
  let fixture: ComponentFixture<JournalEntryListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JournalEntryListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(JournalEntryListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
