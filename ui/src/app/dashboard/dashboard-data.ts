export interface ResourceLink {
  name: string;
  url: string;
}

export const tradeGuidelines: string[] = [
  'Look at a daily chart',
  'Look at SP equity hub',
  'Follow the tastytrade rules',
  'If you break the rules, risk defined',
  'If you are before the trend, accept the risk, or risk define',
  'If a trade keeps you up at night, get out!'
];

export const dailyGuidelines: string[] = [
  'Read the SpotGamma Founders Note',
  'Look at any news that may impact the market',
  'Look at spotgamma dashboard',
  'Look at TradingView ES1!',
  'Look at the SpotGamma Tools',
  'Has the marco environment changed?',
  'Open Tastytrade and look over the trades you have on',
];

export const resources: ResourceLink[] = [
  { name: 'SpotGamma Founders Notes', url: 'https://dashboard.spotgamma.com/foundersNotes' },
  { name: 'TradingView ES1!', url: 'https://www.tradingview.com/chart/HJq2QPjq/?symbol=CME_MINI%3AES1%21' },
  { name: 'Market News', url: 'https://www.forexfactory.com/calendar'},
  { name: 'Financial Juice', url: 'https://www.financialjuice.com/' },
  { name: 'SpotGamma Dashboard', url: 'https://dashboard.spotgamma.com/home?eh-model=legacy' },
  { name: 'SpotGamma Trace', url: 'https://dashboard.spotgamma.com/trace?lense=1&traceSym=SPX' },
  { name: 'SpotGamma Hero', url: 'https://dashboard.spotgamma.com/hiro?eh-model=legacy'},
  { name: 'SG Equity Hub', url: 'https://dashboard.spotgamma.com/equityhub?sym=SPX&eh-model=synthoi' },
  { name: 'SG Scanners', url: 'https://dashboard.spotgamma.com/scanners?eh-model=legacy' },
];
