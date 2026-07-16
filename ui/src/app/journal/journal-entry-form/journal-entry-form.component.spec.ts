import type { Mock } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { ReactiveFormsModule, FormArray } from '@angular/forms';
import { of } from 'rxjs';
import { SharedMaterialModule } from '../../shared/material.module';

import { JournalEntryFormComponent } from './journal-entry-form.component';
import { JournalApiService } from '../journal-api.service';
import { FuturesService } from '../../shared/futures.service';
import { JournalEntry } from '../journal.models';
import { JournalDraftService } from '../journal-draft.service';

type JournalApiMock = {
    create: Mock<JournalApiService['create']>;
    update: Mock<JournalApiService['update']>;
    delete: Mock<JournalApiService['delete']>;
    getMarketData: Mock<JournalApiService['getMarketData']>;
};

type FuturesMock = {
    getCurrentESContract: Mock<FuturesService['getCurrentESContract']>;
};

type JournalDraftMock = {
    load: Mock<JournalDraftService['load']>;
    save: Mock<JournalDraftService['save']>;
    clear: Mock<JournalDraftService['clear']>;
};

describe('JournalEntryFormComponent', () => {
    let component: JournalEntryFormComponent;
    let fixture: ComponentFixture<JournalEntryFormComponent>;

    let apiSpy: JournalApiMock;
    let futuresSpy: FuturesMock;
    let draftSpy: JournalDraftMock;

    beforeEach(async () => {
        apiSpy = {
            create: vi.fn().mockName("JournalApiService.create"),
            update: vi.fn().mockName("JournalApiService.update"),
            delete: vi.fn().mockName("JournalApiService.delete"),
            getMarketData: vi.fn().mockName("JournalApiService.getMarketData")
        };
        apiSpy.getMarketData.mockReturnValue(of([{ mark: '6000', close: '5990' }]));
        draftSpy = {
            load: vi.fn().mockName("JournalDraftService.load"),
            save: vi.fn().mockName("JournalDraftService.save"),
            clear: vi.fn().mockName("JournalDraftService.clear")
        };
        draftSpy.load.mockReturnValue(null);
        draftSpy.save.mockImplementation(value => ({ savedAt: '2026-07-14T12:00:00Z', value }));
        futuresSpy = {
            getCurrentESContract: vi.fn().mockName("FuturesService.getCurrentESContract")
        };
        futuresSpy.getCurrentESContract.mockReturnValue('/ESU5');

        await TestBed.configureTestingModule({
            declarations: [JournalEntryFormComponent],
            imports: [ReactiveFormsModule, SharedMaterialModule],
            providers: [
                { provide: JournalApiService, useValue: apiSpy },
                { provide: JournalDraftService, useValue: draftSpy },
                { provide: FuturesService, useValue: futuresSpy }
            ],
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
        apiSpy.getMarketData.mockReturnValue(of([{ mark: '6010.7', close: '6000' }]));
        component.ngOnInit();
        expect(futuresSpy.getCurrentESContract).toHaveBeenCalled();
        expect(apiSpy.getMarketData).toHaveBeenCalledWith([], [], ['/ESU5'], []);
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
            'tickers',
            'sourceLabel',
            'sourceUrl',
            'notes',
            'events'
        ]);

        const requiredNames = ['date', 'esPrice', 'marketDirection'];
        for (const name of requiredNames) {
            const ctrl = form.get(name)!;
            ctrl.setValue(null);
            expect(ctrl.errors?.['required'], name).toBeTruthy();
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
            tickers: ['SPY'],
            sourceLabel: 'FlowPatrol SPY',
            sourceUrl: '/flowpatrol/SPY',
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
        expect(component.form.get('tickers')?.value).toBe('SPY');
        expect(component.form.get('sourceUrl')?.value).toBe('/flowpatrol/SPY');
        expect(component.events.length).toBe(entry.events.length);
        expect(component.events.at(0).value).toEqual(entry.events[0]);
    });

    it('addEvent adds new form group with latest price', () => {
        const len = component.events.length;
        component.addEvent();
        expect(futuresSpy.getCurrentESContract).toHaveBeenCalled();
        expect(apiSpy.getMarketData).toHaveBeenCalledWith([], [], ['/ESU5'], []);
        expect(component.events.length).toBe(len + 1);
        const group = component.events.at(len) as any;
        expect(group.get('time')).toBeTruthy();
        expect(group.get('price')?.value).toBe(6000);
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
        apiSpy.create.mockReturnValue(of(returned));
        const savedSpy = vi.fn();
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
        apiSpy.update.mockReturnValue(of(component.form.value as JournalEntry));
        const savedSpy = vi.fn();
        component.saved.subscribe(savedSpy);

        component.submit();

        expect(apiSpy.update).toHaveBeenCalled();
        expect(savedSpy).toHaveBeenCalled();
    });

    it('confirmDelete respects confirmation', () => {
        component.form.patchValue({ id: 'delme' });
        const deletedSpy = vi.fn();
        component.deleted.subscribe(deletedSpy);

        vi.spyOn(window, 'confirm').mockReturnValue(false);
        component.confirmDelete();
        expect(apiSpy.delete).not.toHaveBeenCalled();
        expect(deletedSpy).not.toHaveBeenCalled();
        expect(component.form.get('id')?.value).toBe('delme');

        (window.confirm as Mock).mockReturnValue(true);
        apiSpy.delete.mockReturnValue(of(void 0));
        component.confirmDelete();
        expect(apiSpy.delete).toHaveBeenCalledWith('delme');
        expect(deletedSpy).toHaveBeenCalledWith('delme');
        expect(component.form.get('id')?.value).toBeNull();
    });

    it('cancel resets form and emits cancelled', () => {
        component.form.patchValue({ id: '1' });
        const cancelledSpy = vi.fn();
        component.cancelled.subscribe(cancelledSpy);

        component.cancel();
        expect(component.form.get('id')?.value).toBeNull();
        expect(cancelledSpy).toHaveBeenCalled();
    });

    it('merges brokerage prefill into a draft without replacing notes', () => {
        component.form.patchValue({
            tickers: 'SPY',
            notes: 'Existing morning plan',
            sourceLabel: '',
            sourceUrl: ''
        });
        component.prefill = {
            tickers: ['AAPL'],
            sourceLabel: 'Broker activity · AAPL · 2026-07-15',
            sourceUrl: '/journal?activityDate=2026-07-15',
            notes: 'AAPL opening activity\n\nWhy I made this trade:'
        };

        component.ngOnChanges({
            prefill: new SimpleChange(null, component.prefill, true)
        });

        expect(component.form.get('tickers')?.value).toBe('SPY, AAPL');
        expect(component.form.get('notes')?.value).toContain('Existing morning plan');
        expect(component.form.get('notes')?.value).toContain('AAPL opening activity');
        expect(component.form.get('sourceLabel')?.value).toContain('Broker activity');
        expect(component.form.dirty).toBe(true);

        component.ngOnChanges({
            prefill: new SimpleChange(component.prefill, component.prefill, false)
        });
        expect(
            component.form.get('notes')?.value.match(/AAPL opening activity/g)
        ).toHaveLength(1);
    });
});
