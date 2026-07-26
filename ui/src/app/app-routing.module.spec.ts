import { appRoutes } from './app-routing.module';

describe('appRoutes', () => {
  it('lazy-loads the Research and TRACE workspaces', () => {
    const research = appRoutes.find(route => route.path === 'research');
    const trace = appRoutes.find(route => route.path === 'trace');

    expect(research?.loadChildren).toEqual(expect.any(Function));
    expect(trace?.loadChildren).toEqual(expect.any(Function));
  });
});
