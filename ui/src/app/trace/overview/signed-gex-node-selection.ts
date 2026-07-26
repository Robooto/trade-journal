import { TraceDashboardRow, TraceHistogramRow } from './trace.models';

export function selectKeyGexNodes(
  nodes: readonly TraceHistogramRow[],
  rows: readonly TraceDashboardRow[],
): TraceHistogramRow[] {
  const spots = new Map(rows.map(row => [row.capture_id, row.spot]));
  const hiddenStates = new Set(['COLLAPSED', 'COLLAPSING', 'FADED']);
  const groups = new Map<string, TraceHistogramRow[]>();
  for (const node of nodes) {
    if (hiddenStates.has(node.state.toUpperCase())) continue;
    const sign = node.gamma_sign === 'negative' ? 'negative' : 'positive';
    const key = `${node.capture_id}:${sign}`;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  const selected = new Set<TraceHistogramRow>();
  for (const group of groups.values()) {
    const spot = spots.get(group[0].capture_id);
    const material = group.filter(node => (node.cluster_share ?? 0) >= 0.05);
    const candidates = material.length ? material : group;
    const dominant = [...candidates].sort((left, right) =>
      (right.cluster_share ?? 0) - (left.cluster_share ?? 0),
    )[0];
    const above = spot == null ? null : [...candidates]
      .filter(node => node.center_strike >= spot)
      .sort((left, right) => left.center_strike - right.center_strike)[0];
    const below = spot == null ? null : [...candidates]
      .filter(node => node.center_strike <= spot)
      .sort((left, right) => right.center_strike - left.center_strike)[0];
    for (const node of [dominant, above, below]) if (node) selected.add(node);
  }
  return nodes.filter(node => selected.has(node));
}
