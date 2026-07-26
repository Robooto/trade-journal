import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { BrokerageContextComponent } from './flow-ideas/components/brokerage-context/brokerage-context.component';
import { CandidateListComponent } from './flow-ideas/components/candidate-list/candidate-list.component';
import { ContractEvidenceComponent } from './flow-ideas/components/contract-evidence/contract-evidence.component';
import { FlowFiltersComponent } from './flow-ideas/components/flow-filters/flow-filters.component';
import { FlowIdeaInspectorComponent } from './flow-ideas/components/flow-idea-inspector/flow-idea-inspector.component';
import { FlowMetricsComponent } from './flow-ideas/components/flow-metrics/flow-metrics.component';
import { ReportHistoryComponent } from './flow-ideas/components/report-history/report-history.component';
import { ReportUploadComponent } from './flow-ideas/components/report-upload/report-upload.component';
import { WatchlistControlComponent } from './flow-ideas/components/watchlist-control/watchlist-control.component';
import { FlowIdeaDetailPageComponent } from './flow-ideas/flow-idea-detail-page.component';
import { FlowIdeasPageComponent } from './flow-ideas/flow-ideas-page.component';
import { ResearchRoutingModule } from './research-routing.module';
import { ResearchShellComponent } from './research-shell/research-shell.component';
import { WatchlistResearchPageComponent } from './watchlists/watchlist-research-page.component';

@NgModule({
  declarations: [
    ResearchShellComponent,
    FlowIdeasPageComponent,
    FlowIdeaDetailPageComponent,
    FlowFiltersComponent,
    FlowIdeaInspectorComponent,
    FlowMetricsComponent,
    CandidateListComponent,
    ReportHistoryComponent,
    ContractEvidenceComponent,
    BrokerageContextComponent,
    ReportUploadComponent,
    WatchlistControlComponent,
    WatchlistResearchPageComponent,
  ],
  imports: [CommonModule, FormsModule, SharedMaterialModule, ResearchRoutingModule],
})
export class ResearchModule {}
