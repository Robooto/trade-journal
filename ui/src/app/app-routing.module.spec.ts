import { appRoutes } from './app-routing.module';

describe('appRoutes', () => {
  it('lazy-loads the Research workspace', () => {
    const research = appRoutes.find(route => route.path === 'research');

    expect(research?.loadChildren).toEqual(expect.any(Function));
  });
});
