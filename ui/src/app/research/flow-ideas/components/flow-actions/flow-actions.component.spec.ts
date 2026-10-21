import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { FlowActionsComponent, closingContextLabel } from './flow-actions.component';
import { FlowActionSummary } from '../../flow-ideas.models';

const summary: FlowActionSummary = {
  schema_version: 'flowpatrol-actions.v1', status: 'ready', contract_count: 2,
  conflicting_contract_count: 0, incomplete_row_count: 0,
  counts: { bto: 100, btc: 20, sto: 230, stc: 50 },
  calls: { bto: 100, btc: 20, sto: 30, stc: 50 },
  puts: { bto: 0, btc: 0, sto: 200, stc: 0 },
  bought_share: .3, opening_share: .825, dominant_action: 'STO',
};

describe('FlowActionsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FlowActionsComponent], imports: [CommonModule],
    }).compileComponents();
  });

  it('shows buying, selling, opening, and call/put evidence separately', () => {
    const fixture = TestBed.createComponent(FlowActionsComponent);
    fixture.componentInstance.summary = summary;
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Bought 30% / Sold 70%');
    expect(text).toContain('Opening 83%');
    expect(text).toContain('Calls: BTO 100 / BTC 20 / STO 30 / STC 50');
    expect(text).toContain('Puts: BTO 0 / BTC 0 / STO 200 / STC 0');
  });

  it('keeps unavailable counts distinct from zero activity', () => {
    const fixture = TestBed.createComponent(FlowActionsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('breakdown unavailable');
    fixture.componentRef.setInput('summary', {
      ...summary, counts: { bto: 0, btc: 0, sto: 0, stc: 0 }, bought_share: null, opening_share: null,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('BTO 0');
    expect(fixture.nativeElement.textContent).toContain('No classified activity');
  });

  it('marks partial evidence and explains exclusions', () => {
    const fixture = TestBed.createComponent(FlowActionsComponent);
    fixture.componentInstance.summary = { ...summary, status: 'partial', conflicting_contract_count: 1, incomplete_row_count: 2 };
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Partial action evidence');
    expect(fixture.nativeElement.textContent).toContain('1 contracts with conflicting counts and 2 incomplete rows excluded');
  });

  it('labels closing-heavy flow by whether the prior move paid the closed bet', () => {
    const closing = { ...summary, opening_share: .1, prior_return_5d: .042, closed_bet: 'bullish' as const };
    expect(closingContextLabel({ ...closing, closing_context: 'winning' })).toBe('Closing winning bullish bets · +4.2% past 5d');
    expect(closingContextLabel({ ...closing, closed_bet: 'bearish', closing_context: 'losing' })).toBe('Closing losing bearish bets · +4.2% past 5d');
    expect(closingContextLabel({ ...closing, closing_context: 'move_unavailable' })).toBe('Closing bullish bets · past move not in report');
    expect(closingContextLabel({ ...closing, closed_bet: 'mixed', closing_context: 'mixed_bets' })).toBe('Closing mixed bets');
    expect(closingContextLabel(summary)).toBeNull();

    const fixture = TestBed.createComponent(FlowActionsComponent);
    fixture.componentInstance.summary = { ...closing, closing_context: 'winning' };
    fixture.componentInstance.compact = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.closing.winning').textContent).toContain('Closing winning bullish bets');
  });
});
