import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule, FormArray } from '@angular/forms';
import { of } from 'rxjs';
import { SharedMaterialModule } from '../../shared/material.module';

import { JournalEntryFormComponent } from './journal-entry-form.component';
import { JournalApiService } from '../journal-api.service';
import { JournalEntry } from '../journal.models';

describe('JournalEntryFormComponent', () => {
  let component: JournalEntryFormComponent;
  let fixture: ComponentFixture<JournalEntryFormComponent>;

  let apiSpy: jasmine.SpyObj<JournalApiService>;

  beforeEach(async () => {
    apiSpy = jasmine.createSpyObj('JournalApiService', ['create', 'update', 'delete', 'getMarketData']);
    apiSpy.getMarketData.and.returnValue(of([{ mark: '6000', close: '5990' }]));

    await TestBed.configureTestingModule({
      declarations: [JournalEntryFormComponent],
      imports: [ReactiveFormsModule, SharedMaterialModule],
      providers: [{ provide: JournalApiService, useValue: apiSpy }],
      schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(JournalEntryFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit populates form with market data', () => {
    apiSpy.getMarketData.and.returnValue(of([{ mark: '6010.7', close: '6000' }]));
    component.ngOnInit();
    expect(apiSpy.getMarketData).toHaveBeenCalled();
    expect(component.form.get('esPrice')?.value).toBe(6010);
    expect(component.form.get('marketDirection')?.value).toBe('up');
  });

  it('buildForm creates expected controls with validators', () => {
    component.buildForm();
    const form = component.form;
    expect(Object.keys(form.controls)).toEqual([
      'id',
      'date',
      'esPrice',
      'delta',
      'marketDirection',
      'notes',
      'events'
    ]);

    const requiredNames = ['date', 'esPrice', 'delta', 'marketDirection'];
    for (const name of requiredNames) {
      const ctrl = form.get(name)!;
      ctrl.setValue(null);
      expect(ctrl.errors?.['required']).withContext(name).toBeTruthy();
    }

    expect(form.get('events')).toBeInstanceOf(FormArray);
  });

  it('ngOnChanges patches form with entry', () => {
    const entry: JournalEntry = {
      id: '1',
      date: '2023-01-01',
      esPrice: 4200,
      delta: 50,
      marketDirection: 'down',
      notes: 'test note',
      events: [
        { time: '10:00', price: 4200, note: 'open' },
        { time: '11:00', price: 4210, note: 'move' }
      ]
    };

    component.entry = entry;
    component.ngOnChanges({
      entry: new SimpleChange(null, entry, true)
    });

    expect(component.form.get('id')?.value).toBe(entry.id);
    expect(component.form.get('date')?.value).toBe(entry.date);
    expect(component.events.length).toBe(entry.events.length);
    expect(component.events.at(0).value).toEqual(entry.events[0]);
  });

  it('addEvent adds new form group', () => {
    const len = component.events.length;
    component.addEvent();
    expect(component.events.length).toBe(len + 1);
    const group = component.events.at(len) as any;
    expect(group.get('time')).toBeTruthy();
    expect(group.get('price')).toBeTruthy();
    expect(group.get('note')).toBeTruthy();
  });

  it('submit creates entry when no id', () => {
    component.form.patchValue({
      date: '2023-01-02',
      esPrice: 100,
      delta: 1,
      marketDirection: 'up'
    });
    const returned = { ...component.form.value, id: 'newId' } as JournalEntry;
    apiSpy.create.and.returnValue(of(returned));
    const savedSpy = jasmine.createSpy('saved');
    component.saved.subscribe(savedSpy);

    component.submit();

    expect(apiSpy.create).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalledWith(returned);
    expect(component.form.get('id')?.value).toBe('newId');
  });

  it('submit updates entry when id present', () => {
    component.form.patchValue({
      id: 'existing',
      date: '2023-01-03',
      esPrice: 101,
      delta: 2,
      marketDirection: 'up'
    });
    apiSpy.update.and.returnValue(of(component.form.value as JournalEntry));
    const savedSpy = jasmine.createSpy('saved');
    component.saved.subscribe(savedSpy);

    component.submit();

    expect(apiSpy.update).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalled();
  });

  it('confirmDelete respects confirmation', () => {
    component.form.patchValue({ id: 'delme' });
    const deletedSpy = jasmine.createSpy('deleted');
    component.deleted.subscribe(deletedSpy);

    spyOn(window, 'confirm').and.returnValue(false);
    component.confirmDelete();
    expect(apiSpy.delete).not.toHaveBeenCalled();
    expect(deletedSpy).not.toHaveBeenCalled();
    expect(component.form.get('id')?.value).toBe('delme');

    (window.confirm as jasmine.Spy).and.returnValue(true);
    apiSpy.delete.and.returnValue(of(void 0));
    component.confirmDelete();
    expect(apiSpy.delete).toHaveBeenCalledWith('delme');
    expect(deletedSpy).toHaveBeenCalledWith('delme');
    expect(component.form.get('id')?.value).toBeNull();
  });

  it('cancel resets form and emits cancelled', () => {
    component.form.patchValue({ id: '1' });
    const cancelledSpy = jasmine.createSpy('cancelled');
    component.cancelled.subscribe(cancelledSpy);

    component.cancel();
    expect(component.form.get('id')?.value).toBeNull();
    expect(cancelledSpy).toHaveBeenCalled();
  });
});
