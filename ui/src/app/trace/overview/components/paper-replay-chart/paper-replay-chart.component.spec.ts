import { TestBed } from '@angular/core/testing';
import { PaperReplayChartComponent } from './paper-replay-chart.component';

describe('PaperReplayChartComponent', () => {
  it('renders replay segments with readable time and price ticks across gaps', () => {
    const fixture = TestBed.createComponent(PaperReplayChartComponent);
    fixture.componentRef.setInput('replay', {
      schema_version: 'spx-paper-replay.v1', date: '2026-07-24', as_of: '2026-07-24T10:00:00-07:00',
      selected_capture_id: 'c3', entry_capture_id: 'c1',
      trade: { capture_id: 'c1', onset_ts: '2026-07-24T08:00:00-07:00', status: 'closed', reason: 'target', trade_type: 'bull_put_credit', timing_policy: 'noon.v1', frozen_structure: { type: 'support', level: 7390 }, short_strike: 7385, long_strike: 7380, entry_credit_dollars: 100, exit_debit_dollars: 50, gross_pnl_dollars: 50 },
      levels: [{ label: 'Frozen structure', price: 7390 }, { label: 'Short strike', price: 7385 }, { label: 'Long strike', price: 7380 }],
      path: [
        { ts: '2026-07-24T08:00:00-07:00', capture_id: 'c1', spot: 7400, gap_seconds: null, gap: false },
        { ts: '2026-07-24T08:10:00-07:00', capture_id: 'c2', spot: 7395, gap_seconds: 600, gap: false },
        { ts: '2026-07-24T09:00:00-07:00', capture_id: 'c3', spot: 7388, gap_seconds: 3000, gap: true },
      ], hierarchy_events: [{ ts: '2026-07-24T08:00:00-07:00', capture_id: 'c1', event: 'entry' }], gaps_explicit: true, warnings: [],
    });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.replaySegments()).toHaveLength(2);
    expect(component.replaySegments()[1]).toContain('98,');
    expect(component.replayX('c2')).toBeCloseTo(23, 0);
    expect(component.replayTimeTicks().map(tick => tick.label)).toHaveLength(3);
    expect(component.replayPriceTicks()).toEqual([7400, 7390, 7380]);
    expect(fixture.nativeElement.querySelectorAll('polyline')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Path gaps are split');

    fixture.componentRef.setInput('replay', {
      ...component.replay, path: [], levels: [], hierarchy_events: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('polyline')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('circle')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).not.toContain('Path gaps are split');
  });

});
