import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { TracePageComponent } from './overview/trace-page.component';

export const traceRoutes: Routes = [
  {
    path: 'overview',
    component: TracePageComponent,
    title: "TRACE | Robin's Roost",
  },
  {
    path: 'charm',
    pathMatch: 'full',
    redirectTo: 'overview',
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'overview',
  },
];

@NgModule({
  imports: [RouterModule.forChild(traceRoutes)],
  exports: [RouterModule],
})
export class TraceRoutingModule {}
