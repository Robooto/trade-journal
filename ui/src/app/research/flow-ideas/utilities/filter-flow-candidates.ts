import {
  FlowCandidate,
  FlowIdeasDisplayFilters,
  FlowWatchlistsResponse,
} from '../flow-ideas.models';

export function filterFlowCandidates(
  rows: readonly FlowCandidate[],
  filters: FlowIdeasDisplayFilters,
  watchlists: FlowWatchlistsResponse | null,
): readonly FlowCandidate[] {
  return rows.filter(row => {
    if (!filters.includeIndexEtfs && row.is_index_etf) return false;
    if (!matchesWatchlist(row, filters.watchlist, watchlists)) return false;
    return matchesPortfolio(row, filters.portfolio);
  });
}

export function candidateWatchlistNames(
  row: FlowCandidate,
  watchlists: FlowWatchlistsResponse | null,
): readonly string[] | null {
  const symbol = row.symbol.toUpperCase();
  if (watchlists) {
    return watchlists.watchlists
      .filter(list => list.symbols.some(value => value.toUpperCase() === symbol))
      .map(list => list.name);
  }
  if (!row.brokerage_context) return null;
  return row.brokerage_context.watchlists
    .map(item => item.name || item.group_name)
    .filter((name): name is string => Boolean(name));
}

function matchesWatchlist(
  row: FlowCandidate,
  filter: string,
  watchlists: FlowWatchlistsResponse | null,
): boolean {
  if (filter === 'all') return true;
  const names = candidateWatchlistNames(row, watchlists);
  if (names === null) return false;
  if (filter === 'any') return names.length > 0;
  if (filter === 'none') return names.length === 0;
  return filter.startsWith('list:') && names.includes(filter.slice(5));
}

function matchesPortfolio(
  row: FlowCandidate,
  filter: FlowIdeasDisplayFilters['portfolio'],
): boolean {
  if (filter === 'all') return true;
  const exposure = row.brokerage_context?.exposure;
  if (!exposure) return false;
  return filter === 'held' ? exposure.is_held : !exposure.is_held;
}
