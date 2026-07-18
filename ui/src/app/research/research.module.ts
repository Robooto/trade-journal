import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { CandidateListComponent } from './flow-ideas/components/candidate-list/candidate-list.component';
import { FlowFiltersComponent } from './flow-ideas/components/flow-filters/flow-filters.component';
import { FlowMetricsComponent } from './flow-ideas/components/flow-metrics/flow-metrics.component';
import { FlowIdeasPageComponent } from './flow-ideas/flow-ideas-page.component';
import { ResearchRoutingModule } from './research-routing.module';
import { ResearchShellComponent } from './research-shell/research-shell.component';

@NgModule({
  declarations: [
    ResearchShellComponent,
    FlowIdeasPageComponent,
    FlowFiltersComponent,
    FlowMetricsComponent,
    CandidateListComponent,
  ],
  imports: [CommonModule, SharedMaterialModule, ResearchRoutingModule],
})
export class ResearchModule {}
