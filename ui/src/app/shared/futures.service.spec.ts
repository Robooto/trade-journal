import { FuturesService } from './futures.service';

describe('FuturesService', () => {
  let service: FuturesService;

  beforeEach(() => {
    service = new FuturesService();
  });

  it('returns current quarter contract before roll', () => {
    const d = new Date('2025-06-10');
    expect(service.getCurrentESContract(d, 7)).toBe('/ESM5');
  });

  it('rolls to next contract within roll window', () => {
    const d = new Date('2025-06-16');
    expect(service.getCurrentESContract(d, 7)).toBe('/ESU5');
  });

  it('handles year change after December', () => {
    const d = new Date('2025-12-25');
    expect(service.getCurrentESContract(d, 7)).toBe('/ESH6');
  });
});
