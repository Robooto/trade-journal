import { currentEquityHubUrl, newYorkDate } from './equity-hub-url';

describe('equityHubUrl', () => {
  it('uses the current New York date across the UTC date boundary', () => {
    expect(newYorkDate(new Date('2026-07-19T03:30:00Z'))).toBe('2026-07-18');
    expect(newYorkDate(new Date('2026-07-19T04:30:00Z'))).toBe('2026-07-19');
  });

  it('builds a current-date EquityHub URL instead of reusing report date', () => {
    expect(
      currentEquityHubUrl('aapl', new Date('2026-07-19T04:30:00Z')),
    ).toBe(
      'https://dashboard.spotgamma.com/equityhub?eh-model=synthoi&sym=AAPL&date=2026-07-19&cv_mode=gamma',
    );
  });
});
