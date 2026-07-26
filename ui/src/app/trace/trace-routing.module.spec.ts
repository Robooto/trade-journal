import { traceRoutes } from './trace-routing.module';

describe('traceRoutes', () => {
  it('keeps TRACE overview and Charm together in one workspace', () => {
    const shell = traceRoutes[0];
    const children = shell.children ?? [];

    expect(shell.path).toBe('');
    expect(children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'overview',
          title: "TRACE | Robin's Roost",
        }),
        expect.objectContaining({
          path: 'charm',
          title: "Charm Pressure | Robin's Roost",
        }),
        expect.objectContaining({
          path: '',
          pathMatch: 'full',
          redirectTo: 'overview',
        }),
      ]),
    );
  });
});