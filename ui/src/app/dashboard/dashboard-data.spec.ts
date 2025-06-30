import { tradeGuidelines, dailyOverviewAnalysis } from './dashboard-data';

describe('dashboard data', () => {
  it('contains tastytrade guideline', () => {
    expect(tradeGuidelines).toContain('Follow the tastytrade rules');
  });

  it('includes tradingview link', () => {
    const found = dailyOverviewAnalysis.find(r => r.name === 'TradingView ES1!');
    expect(found?.url).toContain('tradingview.com');
  });
});
