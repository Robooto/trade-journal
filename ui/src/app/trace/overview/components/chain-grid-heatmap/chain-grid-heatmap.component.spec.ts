import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TraceApiService } from '../../data-access/trace-api.service';
import type { ChainGridColumn, ChainGridViewResponse } from '../../trace.models';
import { ChainGridHeatmapComponent, hiroStrip } from './chain-grid-heatmap.component';

function column(minute: number, spot: number, hiro: Partial<ChainGridColumn['hiro']> = {}): ChainGridColumn {
  const ts = `2026-10-20T09:${String(minute).padStart(2, '0')}:05-07:00`;
  return { capture_id: ts, ts, spot, grid: 'recorded',
    hiro: { state: 'none', side_against_move: null, move_30m_points: null, change_30m: null, ...hiro },
    nodes: [{ strike: 7712, sign: 'negative', share: 0.1 }, { strike: 7600, sign: 'positive', share: 0.2 }],
    cells: [{ side: 'call', strike: 7710, credit: 200, mid_credit: 220, delta: 0.3 }, { side: 'call', strike: 7720, credit: 80, mid_credit: 90, delta: 0.12 },
            { side: 'put', strike: 7690, credit: 150, mid_credit: 160, delta: 0.25 }] };
}

const view: ChainGridViewResponse = {
  schema_version: 'trace-chain-grid-view.v1', date: '2026-10-20', width_points: 10, max_distance_points: 60, settlement: 7712.35,
  strikes: [7690, 7710, 7720], recorded_snapshots: 2, notes: [], order_submission_enabled: false,
  captures: [column(0, 7700, { state: 'confirms', side_against_move: 'call', move_30m_points: -10, change_30m: -2e9 }),
             column(10, 7702, { state: 'opposes', side_against_move: 'put', move_30m_points: 6, change_30m: -1e9 })],
};

describe('ChainGridHeatmapComponent', () => {
  let api: { chainGrid: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    api = { chainGrid: vi.fn(() => of(view)) };
    await TestBed.configureTestingModule({ imports: [ChainGridHeatmapComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  function render(captureTs: string | null = null) {
    const fixture = TestBed.createComponent(ChainGridHeatmapComponent);
    fixture.componentRef.setInput('date', '2026-10-20');
    fixture.componentRef.setInput('captureTs', captureTs);
    fixture.detectChanges();
    return fixture;
  }

  it('draws one cell per strike and capture for the chosen side, with nodes in range and the HIRO strip', () => {
    const fixture = render(view.captures[1].ts);
    const component = fixture.componentInstance;
    expect(api.chainGrid).toHaveBeenCalledWith('2026-10-20');
    expect(component.strikes()).toEqual([7720, 7710]);
    expect(fixture.nativeElement.querySelectorAll('.grid-cell').length).toBe(4);
    expect(fixture.nativeElement.querySelector('.grid-cell title').textContent).toContain('7710 call');
    // The negative node at 7712 is inside the call rows; the positive one at 7600 is not.
    expect(component.nodeMarks().map(n => n.negative)).toEqual([true, true]);
    expect(component.strip().map(s => s.state)).toEqual(['tagged', 'none']);
    expect(component.selectedIndex()).toBe(1);
    component.side.set('put');
    expect(component.strip().map(s => s.state)).toEqual(['none', 'opposes']);
    expect(component.strikes()).toEqual([7690]);
  });

  it('colors by credit or delta on one blue ramp, brightest at the 95th percentile', () => {
    const component = render().componentInstance;
    const credit = component.cells().map(c => c.fill);
    component.metric.set('delta');
    expect(component.cells().map(c => c.fill)).toEqual(credit);
    expect(component.color(0)).toBe('#0d366b');
    expect(component.color(1e9)).toBe('#cde2fb');
  });

  it('emits the capture for a clicked column', () => {
    const component = render().componentInstance;
    const emitted: string[] = [];
    component.captureSelected.subscribe(ts => emitted.push(ts));
    component.select(0);
    expect(emitted).toEqual([view.captures[0].ts]);
  });

  it('reads the strip like the ladder tag and reports an unavailable grid', () => {
    expect(hiroStrip({ ...view.captures[0], hiro: { ...view.captures[0].hiro, state: 'flat' } }, 'put')).toBe('flat');
    api.chainGrid.mockReturnValue(throwError(() => new Error('offline')));
    expect(render().nativeElement.textContent).toContain('Chain grid unavailable');
  });
});
