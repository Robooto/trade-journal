import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { SpreadOrder, SpreadOrdersApiService, SpreadQuote } from '../../data-access/spread-orders-api.service';
import { SpreadTicketComponent } from './spread-ticket.component';

const QUOTE: SpreadQuote = {
  side: 'call', expiration: '2026-10-26', short_strike: 7650, long_strike: 7655, width: 5,
  short_symbol: 'SPXW  261026C07650000', long_symbol: 'SPXW  261026C07655000',
  short: { bid: 2.1, ask: 2.3, delta: 0.3 }, long: { bid: 1, ask: 1.15, delta: 0.25 },
  natural: 0.95, mid: 1.125, suggested_price: 1.1, quoted_at: '2026-10-26T14:00:00Z',
};

function order(overrides: Partial<SpreadOrder> = {}): SpreadOrder {
  return { id: 7, session_date: '2026-10-26', account_number: '5WW38633', side: 'call', short_strike: 7650, long_strike: 7655,
    width: 5, quantity: 1, short_symbol: QUOTE.short_symbol, long_symbol: QUOTE.long_symbol, limit_price: 1.1, tasty_order_id: '101',
    status: 'Live', working: true, fill_credit: null, events: [], created_at: '', updated_at: '', ...overrides };
}

describe('SpreadTicketComponent', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  function create(live = true, rows: SpreadOrder[] = []) {
    api = {
      config: vi.fn(() => of({ live_enabled: live, account_number: '5WW38633', width: 5, max_quantity: 1, tick: 0.05 })),
      today: vi.fn(() => of({ rows })),
      quote: vi.fn(() => of(QUOTE)),
      preview: vi.fn(() => of({ account_number: '5WW38633', payload: {}, buying_power_change: -390, fees: -2.72, warnings: [] })),
      submit: vi.fn(() => of(order())),
      refresh: vi.fn(() => of(order({ status: 'Filled', working: false, fill_credit: 1.1 }))),
      reprice: vi.fn(() => of(order({ limit_price: 1.05 }))),
      cancel: vi.fn(() => of(order({ status: 'Cancelled', working: false }))),
    };
    TestBed.configureTestingModule({
      imports: [SpreadTicketComponent],
      providers: [
        { provide: SpreadOrdersApiService, useValue: api },
        { provide: MAT_DIALOG_DATA, useValue: { side: 'call', strike: 7650 } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SpreadTicketComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => vi.useRealTimers());

  it('starts at the suggested mid and snaps every change to the $0.05 tick', () => {
    const ticket = create();
    expect(ticket.price()).toBe(1.1);
    ticket.step(1);
    expect(ticket.price()).toBe(1.15);
    ticket.setPrice(1.12);
    expect(ticket.price()).toBe(1.1);
    expect(ticket.maxLoss()).toBeCloseTo(390);
    ticket.ngOnDestroy();
  });

  it('sends only after a preview at the current price and an explicit confirmation', () => {
    const ticket = create();
    expect(ticket.canSend()).toBe(false);
    ticket.runPreview();
    expect(api['preview']).toHaveBeenCalledWith('call', 7650, 1.1);
    expect(ticket.canSend()).toBe(false);
    ticket.confirmed.set(true);
    expect(ticket.canSend()).toBe(true);
    ticket.step(1);  // A new price needs a new preview.
    expect(ticket.canSend()).toBe(false);
    ticket.runPreview();
    ticket.confirmed.set(true);
    ticket.send();
    expect(api['submit']).toHaveBeenCalledWith('call', 7650, 1.15);
    expect(ticket.order()?.status).toBe('Live');
    ticket.lowerCredit();
    expect(api['reprice']).toHaveBeenCalledWith(7, 1.05);
    ticket.ngOnDestroy();
  });

  it('never sends while the server switch is off', () => {
    const ticket = create(false);
    ticket.runPreview();
    ticket.confirmed.set(true);
    expect(ticket.canSend()).toBe(false);
    ticket.ngOnDestroy();
  });

  it('opens on a still-working order and follows it to the fill', () => {
    vi.useFakeTimers();
    const ticket = create(true, [order()]);
    expect(api['quote']).not.toHaveBeenCalled();
    expect(ticket.order()?.status).toBe('Live');
    vi.advanceTimersByTime(2000);
    expect(ticket.order()?.status).toBe('Filled');
    expect(ticket.working()).toBe(false);
    ticket.ngOnDestroy();
  });
});
