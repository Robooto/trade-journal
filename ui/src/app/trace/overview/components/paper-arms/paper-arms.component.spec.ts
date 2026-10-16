import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import type { PaperArm, PaperArmScorecard } from '../../data-access/generated/research-contracts';
import { TraceApiService } from '../../data-access/trace-api.service';
import { PaperArmsComponent } from './paper-arms.component';

function arm(overrides: Partial<PaperArm>): PaperArm {
  return { arm_id: 'a', policy_id: 'p', label: 'Arm', kind: 'shadow', start_date: '2026-09-28', end_date: null, closes: 74,
    sessions: 15, net_dollars: -1847.4, net_per_close: -24.96, win_rate: 0.66, required_sessions: 20, required_closes: 100,
    status: 'collecting', ...overrides };
}

function card(arms: PaperArm[]): PaperArmScorecard {
  return { schema_version: 'paper-arm-scorecard.v1', from_date: '2026-09-22', to_date: '2026-10-16', as_of: '2026-10-16T21:00:00Z',
    cost_per_close_dollars: 12.6, arms, automatic_promotion: false, order_submission_enabled: false };
}

describe('PaperArmsComponent', () => {
  let api: { paperArms: ReturnType<typeof vi.fn<(date: string) => Observable<PaperArmScorecard>>> };
  beforeEach(async () => {
    api = { paperArms: vi.fn(() => of(card([
      arm({ arm_id: 'base', label: 'Bot baseline · every signal', kind: 'baseline', start_date: '2026-09-22', closes: 131,
        sessions: 19, net_dollars: -4665.6, net_per_close: -35.62, required_closes: null, required_sessions: null, status: 'control' }),
      arm({ arm_id: 'distance', label: 'Skip 0–3 point structure distance' }),
      arm({ arm_id: 'c0', label: 'Rotation C0', kind: 'rotation', start_date: '2026-10-12', end_date: '2026-11-06', closes: 7, sessions: 4,
        net_dollars: 22, net_per_close: 3.14 }),
    ]))) };
    await TestBed.configureTestingModule({ imports: [PaperArmsComponent], providers: [{ provide: TraceApiService, useValue: api }] }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(PaperArmsComponent);
    fixture.componentRef.setInput('date', '2026-10-16'); fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists every arm with net, per-trade results and review progress', () => {
    const rows = Array.from(render().querySelectorAll('tbody tr'));
    expect(api.paperArms).toHaveBeenCalledWith('2026-10-16');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('−$4,665.60');
    expect(rows[0].textContent).toContain('Comparison base');
    expect(rows[1].textContent).toContain('74/100 · 15/20');
    expect(rows[1].getAttribute('data-net')).toBe('loss');
    expect(rows[1].querySelector('.status')).toBeNull();
    expect(rows[2].textContent).toContain('10-12–11-06');
    expect(rows[2].getAttribute('data-net')).toBe('gain');
  });

  it('caps progress at the floor and reports unavailable data without numbers', () => {
    const component = TestBed.createComponent(PaperArmsComponent).componentInstance;
    expect(component.fraction(arm({ closes: 107, sessions: 16 }))).toBeCloseTo(0.8);
    expect(component.progress(arm({ closes: 107, sessions: 16 }))).toBe('100/100 · 16/20');
    api.paperArms.mockReturnValue(throwError(() => new Error('offline')));
    const element = render();
    expect(element.textContent).toContain('Paper strategy scorecard unavailable');
    expect(element.querySelector('table')).toBeNull();
  });
});
