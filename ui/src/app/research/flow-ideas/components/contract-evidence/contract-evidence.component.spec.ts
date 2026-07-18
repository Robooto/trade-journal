import { FlowContractEvidenceRow } from '../../flow-ideas.models';
import { groupContractEvidence } from './contract-evidence.component';

const evidence = (
  spreadId: string | null,
  row: number,
): FlowContractEvidenceRow => ({
  report_date: '2026-07-09',
  trading_date: '2026-07-09',
  symbol: 'AAPL',
  spread_id: spreadId,
  section: 'unusual',
  source_page: 12,
  source_row_index: row,
  measure_name: 'premium',
  measure_value_usd: 1_000_000,
  source_row_text: `row ${row}`,
  review_status: 'accepted',
});

describe('groupContractEvidence', () => {
  it('groups only matching backend spread IDs and retains every evidence row', () => {
    const groups = groupContractEvidence([
      evidence('SG-7', 2),
      evidence('SG-7', 3),
      evidence(null, 4),
      evidence(null, 5),
    ]);

    expect(groups.length).toBe(3);
    expect(groups[0].label).toBe('SG-7');
    expect(groups[0].rows).toEqual([evidence('SG-7', 2), evidence('SG-7', 3)]);
    expect(groups[1].rows).toEqual([evidence(null, 4)]);
    expect(groups[2].rows).toEqual([evidence(null, 5)]);
  });
});
