export interface ResourceLink {
  name: string;
  url: string;
}

export const guidelines: string[] = [
  'Look at a daily chart',
  'Look at SP equity hub',
  'If a trade keeps you up at night, get out!'
];

export const resources: ResourceLink[] = [
  { name: 'TradingView ES1!', url: 'https://www.tradingview.com/chart/HJq2QPjq/?symbol=CME_MINI%3AES1%21' },
  { name: 'SpotGamma Dashboard', url: 'https://dashboard.spotgamma.com/home?eh-model=legacy' }
];
