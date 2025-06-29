import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'journal',
    loadChildren: () =>
      import('./journal/journal.module').then(m => m.JournalModule)
  },
  {
    path: 'positions',
    loadChildren: () =>
      import('./positions/positions.module').then(m => m.PositionsModule)
  },
  {
    path: 'hiro',
    loadChildren: () =>
      import('./hiro/hiro.module').then(m => m.HiroModule)
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  }
  // future feature modules here...
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule {}
