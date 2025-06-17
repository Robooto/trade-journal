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
    path: '',
    loadChildren: () =>
      import('./dashboard/dashboard.module').then(m => m.DashboardModule)
  },
  // future feature modules here...
];

@NgModule({
  imports: [ RouterModule.forRoot(routes) ],
  exports: [ RouterModule ]
})
export class AppRoutingModule {}
