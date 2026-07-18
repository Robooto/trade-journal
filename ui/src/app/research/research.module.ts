import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { BrokerageContextComponent } from './flow-ideas/components/brokerage-context/brokerage-context.component';
import { CandidateListComponent } from './flow-ideas/components/candidate-list/candidate-list.component';
import { ContractEvidenceComponent } from './flow-ideas/components/contract-evidence/contract-evidence.component';
import { FlowFiltersComponent } from './flow-ideas/components/flow-filters/flow-filters.component';
import { FlowMetricsComponent } from './flow-ideas/components/flow-metrics/flow-metrics.component';
import { ReportHistoryComponent } from './flow-ideas/components/report-history/report-history.component';
import { FlowIdeaDetailPageComponent } from './flow-ideas/flow-idea-detail-page.component';
import { FlowIdeasPageComponent } from './flow-ideas/flow-ideas-page.component';
import { ResearchRoutingModule } from './research-routing.module';
import { ResearchShellComponent } from './research-shell/research-shell.component';

@NgModule({
  declarations: [
    ResearchShellComponent,
    FlowIdeasPageComponent,
    FlowIdeaDetailPageComponent,
    FlowFiltersComponent,
    FlowMetricsComponent,
    CandidateListComponent,
    ReportHistoryComponent,
    ContractEvidenceComponent,
    BrokerageContextComponent,
  ],
  imports: [CommonModule, SharedMaterialModule, ResearchRoutingModule],
})
export class ResearchModule {}
