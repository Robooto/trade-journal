import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CharmPageComponent } from './charm/charm-page.component';
import { TracePageComponent } from './overview/trace-page.component';
import { TraceShellComponent } from './trace-shell/trace-shell.component';

export const traceRoutes: Routes = [
  {
    path: '',
    component: TraceShellComponent,
    children: [
      {
        path: 'overview',
        component: TracePageComponent,
        title: "TRACE | Robin's Roost",
      },
      {
        path: 'charm',
        component: CharmPageComponent,
        title: "Charm Pressure | Robin's Roost",
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'overview',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(traceRoutes)],
  exports: [RouterModule],
})
export class TraceRoutingModule {}