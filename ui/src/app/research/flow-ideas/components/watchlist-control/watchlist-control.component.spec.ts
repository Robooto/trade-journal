import { WatchlistControlComponent } from './watchlist-control.component';

describe('WatchlistControlComponent', () => {
  it('reacts to symbol input changes and clears selection before emitting an explicit add', () => {
    const component = new WatchlistControlComponent();
    component.symbol = 'aapl';
    component.context = {
      symbol: 'AAPL',
      watchlists: [{ name: 'Core', source: 'private' }],
      price: {},
      volatility: {},
      earnings: { status: 'unavailable' },
      exposure: { is_held: false, account_numbers: [], asset_classes: [], option_position_count: 0 },
      source_status: [],
      warnings: [],
    };
    component.watchlists = {
      schema_version: 'broker-watchlists.v1',
      flowpatrol_schema_version: 'flowpatrol-brokerage-watchlists.v1',
      writes_enabled: true,
      watchlists: [
        { name: 'Core', symbols: [], symbol_count: 0 },
        { name: 'Existing', symbols: ['AaPl'], symbol_count: 1 },
        { name: 'Ideas', symbols: [], symbol_count: 0 },
      ],
    };

    expect(component.available().map(item => item.name)).toEqual(['Ideas']);

    component.symbol = 'MSFT';
    expect(component.available().map(item => item.name)).toEqual(['Existing', 'Ideas']);

    const emitted: string[] = [];
    component.addRequested.subscribe(name => emitted.push(name));
    component.selectedName = 'Ideas';
    component.requestAdd();

    expect(emitted).toEqual(['Ideas']);
    expect(component.selectedName).toBe('');
  });
});
