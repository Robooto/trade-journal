import { traceRoutes } from './trace-routing.module';

describe('traceRoutes', () => {
  it('uses one TRACE dashboard and redirects the former Charm page', () => {
    expect(traceRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'overview',
        title: "TRACE | Robin's Roost",
      }),
      expect.objectContaining({
        path: 'charm',
        pathMatch: 'full',
        redirectTo: 'overview',
      }),
      expect.objectContaining({
        path: '',
        pathMatch: 'full',
        redirectTo: 'overview',
      }),
    ]));
    expect(traceRoutes.some(route => route.title === "Charm Pressure | Robin's Roost")).toBe(false);
  });
});
