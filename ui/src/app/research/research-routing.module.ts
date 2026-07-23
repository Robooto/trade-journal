import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { FlowIdeaDetailPageComponent } from './flow-ideas/flow-idea-detail-page.component';
import { FlowIdeasPageComponent } from './flow-ideas/flow-ideas-page.component';
import { ResearchShellComponent } from './research-shell/research-shell.component';
import { WatchlistResearchPageComponent } from './watchlists/watchlist-research-page.component';

export const researchRoutes: Routes = [
  {
    path: '',
    component: ResearchShellComponent,
    children: [
      {
        path: 'flow-ideas/:tradingDate/:symbol',
        component: FlowIdeaDetailPageComponent,
        title: "Flow Idea | Robin's Roost",
      },
      {
        path: 'flow-ideas',
        component: FlowIdeasPageComponent,
        title: "Flow Ideas | Robin's Roost",
      },
      {
        path: 'watchlists',
        component: WatchlistResearchPageComponent,
        title: "Watchlists | Robin's Roost",
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
