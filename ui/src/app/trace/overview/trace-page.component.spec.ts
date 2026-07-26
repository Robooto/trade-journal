import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { SharedMaterialModule } from '../../shared/material.module';
import { TraceFacade } from './data-access/trace.facade';
import { TracePageComponent } from './trace-page.component';

class TraceFacadeStub {
  readonly sessions = signal([]);
  readonly sessionsLoading = signal(false);
  readonly sessionsError = signal<string | null>(null);
  readonly selectedDate = signal('');
  readonly selectedSession = signal(null);
  readonly sessionLoading = signal(false);
  readonly sessionError = signal<string | null>(null);
  readonly bundle = signal(null);
  readonly resourceStatuses = signal([]);
  readonly availableResourceCount = signal(0);
  readonly loadSessions = vi.fn();
  readonly selectDate = vi.fn();
  readonly reload = vi.fn();
}

describe('TracePageComponent', () => {
  let fixture: ComponentFixture<TracePageComponent>;
  let facade: TraceFacadeStub;

  beforeEach(async () => {
    facade = new TraceFacadeStub();
    await TestBed.configureTestingModule({
      declarations: [TracePageComponent],
      imports: [
        CommonModule,
        FormsModule,
        SharedMaterialModule,
        NoopAnimationsModule,
      ],
      providers: [{ provide: TraceFacade, useValue: facade }],
    }).compileComponents();

    fixture = TestBed.createComponent(TracePageComponent);
    fixture.detectChanges();
  });

  it('loads the session catalog and explains the thin frontend boundary', () => {
    expect(facade.loadSessions).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Source readiness');
    expect(fixture.nativeElement.textContent).toContain('Thin frontend boundary');
  });

  it('delegates session changes to the facade', () => {
    fixture.componentInstance.selectDate('2026-07-24');
    expect(facade.selectDate).toHaveBeenCalledWith('2026-07-24');
  });
});