import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;

  beforeEach(() => {
    service = new LoadingService();
  });

  it('emits true on first show and false after hide', () => {
    const values: boolean[] = [];
    const sub = service.loading$.subscribe(v => values.push(v));

    service.show();
    service.hide();

    expect(values).toEqual([false, true, false]);
    sub.unsubscribe();
  });

  it('only toggles when count drops to zero', () => {
    let last = false;
    const sub = service.loading$.subscribe(v => last = v);

    service.show();
    service.show();
    service.hide();
    expect(last).toBeTrue();
    service.hide();
    expect(last).toBeFalse();
    sub.unsubscribe();
  });
});
