import { TraceDashboardRow, TraceHistogramRow } from './trace.models';
import { selectKeyGexNodes } from './signed-gex-node-selection';

function node(
  sign: 'positive' | 'negative',
  strike: number,
  share: number,
  state = 'STABLE',
): TraceHistogramRow {
  return {
    ts: '2026-07-24T13:00:00-07:00',
    timestamp: '2026-07-24T13:00:00-07:00',
    capture_id: 'capture-1',
    gamma_sign: sign,
    center_strike: strike,
    cluster_share: share,
    state,
  } as TraceHistogramRow;
}

describe('selectKeyGexNodes', () => {
  it('keeps dominant and nearest structural nodes while removing stale noise', () => {
    const rows = [{ capture_id: 'capture-1', spot: 7412 }] as TraceDashboardRow[];
    const nodes = [
      node('positive', 7350, 0.14),
      node('positive', 7405, 0.08),
      node('positive', 7420, 0.12),
      node('positive', 7480, 0.55),
      node('positive', 7440, 0.70, 'COLLAPSED'),
      node('negative', 7390, 0.35),
      node('negative', 7400, 0.15),
      node('negative', 7430, 0.24),
      node('negative', 7460, 0.10),
    ];

    const selected = selectKeyGexNodes(nodes, rows);

    expect(selected).toHaveLength(6);
    expect(selected.map(item => item.center_strike)).toEqual([7405, 7420, 7480, 7390, 7400, 7430]);
    expect(selected.some(item => item.state === 'COLLAPSED')).toBe(false);
  });
});
