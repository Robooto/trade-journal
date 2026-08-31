import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { SharedMaterialModule } from '../../../../shared/material.module';
import { TraceApiService } from '../../data-access/trace-api.service';
import { DecisionJournalComponent } from './decision-journal.component';
import { Spx0DteDecisionJournalResponse } from './decision-journal.models';


const RESPONSE: Spx0DteDecisionJournalResponse = {
  schema_version: 'spx-0dte-decision.v1', protocol_id: 'spx-0dte-decision-journal-v1',
  date: '2026-08-31', ts: '2026-08-31T08:00:00-07:00', capture_id: 'c1', prior_capture_id: 'c0',
  decision_status: 'ready', decision: 'take', trade_type: 'bull_put_credit', quality_score: 92, grade: 'A',
  score_components: { positive_gamma: 20 }, hard_gates: { positive_gamma: true },
  reason_codes: ['positive_gamma', 'prior_structure_confirmed'],
  frozen_structure: { type: 'local_support', level: 7490, distance_points_at_freeze: 10, distance_band: 'far_10_20' },
  execution_ready: false, paper_trade_status: 'awaiting_option_quote',
  paper_trade: { spread_width_points: 5, profit_target_fraction_of_initial_credit: 0.5, forced_exit_time: '12:00 America/Los_Angeles' },
  selection: 'exact',
  protocol: { id: 'spx-0dte-decision-journal-v1', status: 'preregistered', frozen_on: '2026-08-30', prospective_start_date: '2026-08-31' },
  study: { id: 'spx-0dte-decision-journal', status: 'preregistered', mode: 'prospective_decision_journal', order_submission_enabled: false, ai_decisioning: false },
  warnings: [],
};

class ApiStub {
  readonly decisionJournal = vi.fn(() => of(RESPONSE));
  readonly human0DteDecision = vi.fn(() => of({ schema_version: 'spx-0dte-human-decision-list.v1', rows: [] }));
  readonly createHuman0DteDecision = vi.fn(payload => of({ schema_version: 'spx-0dte-human-decision.v1', id: 1, created_at: 'now', ...payload }));
}

describe('DecisionJournalComponent', () => {
  let fixture: ComponentFixture<DecisionJournalComponent>;
  let api: ApiStub;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DecisionJournalComponent],
      imports: [CommonModule, FormsModule, SharedMaterialModule, NoopAnimationsModule],
      providers: [{ provide: TraceApiService, useClass: ApiStub }],
    }).compileComponents();
    fixture = TestBed.createComponent(DecisionJournalComponent);
    api = TestBed.inject(TraceApiService) as unknown as ApiStub;
    fixture.componentRef.setInput('date', '2026-08-31');
    fixture.componentRef.setInput('captureTs', '2026-08-31T08:00:00-07:00');
    fixture.componentRef.setInput('captureId', 'c1');
    fixture.detectChanges();
  });

  it('renders one scored system decision and the human journal', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SPX 0DTE Decision Journal');
    expect(text).toContain('take · bull put credit');
    expect(text).toContain('Grade A · 92/100');
    expect(text).toContain('Take, pass, and optional notes');
    expect(text).toContain('not probability of profit');
    expect(api.human0DteDecision).toHaveBeenCalledWith('2026-08-31', 'c1');
  });

  it('requires a type for a human take and freezes the capture decision', () => {
    fixture.componentInstance.chooseHumanDecision('take');
    fixture.componentInstance.saveHumanDecision();
    expect(fixture.componentInstance.saveError()).toContain('Choose bull put or bear call');

    fixture.componentInstance.humanTradeType = 'bear_call_credit';
    fixture.componentInstance.humanNotes = 'Resistance held.';
    fixture.componentInstance.saveHumanDecision();
    expect(api.createHuman0DteDecision).toHaveBeenCalledWith(expect.objectContaining({
      capture_id: 'c1', decision: 'take', trade_type: 'bear_call_credit', notes: 'Resistance held.',
    }));
    expect(fixture.componentInstance.humanDecision()?.decision).toBe('take');
  });
});
