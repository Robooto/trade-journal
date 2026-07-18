const EQUITY_HUB_BASE_URL = 'https://dashboard.spotgamma.com/equityhub';

export function newYorkDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find(part => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function currentEquityHubUrl(
  symbol: string,
  now: Date = new Date(),
): string {
  const params = new URLSearchParams({
    'eh-model': 'synthoi',
    sym: symbol.trim().toUpperCase(),
    date: newYorkDate(now),
    cv_mode: 'gamma',
  });
  return `${EQUITY_HUB_BASE_URL}?${params.toString()}`;
}
