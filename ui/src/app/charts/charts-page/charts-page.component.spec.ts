import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ChartsPageComponent } from './charts-page.component';
import { SharedMaterialModule } from '../../shared/material.module';

describe('ChartsPageComponent', () => {
  let component: ChartsPageComponent;
  let fixture: ComponentFixture<ChartsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ChartsPageComponent],
      imports: [
        ReactiveFormsModule,
        SharedMaterialModule,
        NoopAnimationsModule,
        HttpClientTestingModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChartsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default form values', () => {
    expect(component.chartForm.get('symbol')?.value).toBe('AAPL');
    expect(component.chartForm.get('resolution')?.value).toBe('1d');
  });

  it('should validate symbol format', () => {
    const symbolControl = component.chartForm.get('symbol');
    
    symbolControl?.setValue('INVALID123');
    expect(symbolControl?.hasError('pattern')).toBeTruthy();
    
    symbolControl?.setValue('TSLA');
    expect(symbolControl?.hasError('pattern')).toBeFalsy();
  });
});