import { researchRoutes } from './research-routing.module';

describe('researchRoutes', () => {
  it('keeps Flow Ideas as the Research landing route', () => {
    const shell = researchRoutes[0];
    const children = shell.children ?? [];

    expect(shell.path).toBe('');
    expect(children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'flow-ideas',
          title: "Flow Ideas | Robin's Roost",
        }),
        expect.objectContaining({
          path: '',
          pathMatch: 'full',
          redirectTo: 'flow-ideas',
        }),
      ]),
    );
  });
});
