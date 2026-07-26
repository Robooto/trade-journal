import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TraceDashboardRow } from '../../trace.models';
import { CaptureHistoryComponent } from './capture-history.component';

const rows: TraceDashboardRow[] = [
  {
    ts: '2026-07-24T12:50:04-07:00', capture_id: 'capture-1', spot: 7410,
    spx_hiro: -500_000_000, spx_hiro_rate_per_minute: 20_000_000,
    equities_hiro: 320_000_000, equities_hiro_rate_per_minute: -10_000_000,
    put_wall: 7300, hedge_wall: 7410, call_wall: 7500,
    global_shelf_center: 7404, shelf_center_d: 2, shelf_direction: 'up',
    local_gamma_setup: 'neg_with_above', pocket_sign: 'negative',
    flow_relationship: 'divergent', flow_state: 'spx_up_equities_down',
  } as TraceDashboardRow,
  {
    ts: '2026-07-24T13:00:05-07:00', capture_id: 'capture-2', spot: 7412,
    spx_hiro: -420_000_000, spx_hiro_rate_per_minute: 25_000_000,
    equities_hiro: 280_000_000, equities_hiro_rate_per_minute: -8_000_000,
    put_wall: 7300, hedge_wall: 7410, call_wall: 7500,
    global_shelf_center: 7406, shelf_center_d: 2, shelf_direction: 'up',
    local_gamma_setup: 'neg_with_above', pocket_sign: 'negative',
    flow_relationship: 'divergent', flow_state: 'spx_up_equities_down',
  } as TraceDashboardRow,
];

describe('CaptureHistoryComponent', () => {
  let fixture: ComponentFixture<CaptureHistoryComponent>;
  let component: CaptureHistoryComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CaptureHistoryComponent],
      imports: [CommonModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CaptureHistoryComponent);
    component = fixture.componentInstance;
    component.rows = rows;
    component.activeIndex = 1;
    fixture.detectChanges();
  });

  it('renders every capture and the exact inspection fields', () => {
    const details = fixture.nativeElement.querySelector('details');
    details.open = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('tbody tr.active')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('7,412');
    expect(fixture.nativeElement.textContent).toContain('put / hedge / call');
    expect(fixture.nativeElement.textContent).toContain('Neg With Above');
    expect(fixture.nativeElement.textContent).toContain('Divergent');
  });

  it('emits the selected row index from its timestamp control', () => {
    const selected = vi.fn();
    component.captureSelected.subscribe(selected);
    fixture.nativeElement.querySelectorAll('tbody button')[0].click();

    expect(selected).toHaveBeenCalledWith(0);
  });
});