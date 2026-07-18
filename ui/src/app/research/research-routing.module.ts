import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { FlowIdeasPageComponent } from './flow-ideas/flow-ideas-page.component';
import { ResearchShellComponent } from './research-shell/research-shell.component';

export const researchRoutes: Routes = [
  {
    path: '',
    component: ResearchShellComponent,
    children: [
      {
        path: 'flow-ideas',
        component: FlowIdeasPageComponent,
        title: "Flow Ideas | Robin's Roost",
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'flow-ideas',
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(researchRoutes)],
  exports: [RouterModule],
})
export class ResearchRoutingModule {}
