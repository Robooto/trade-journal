import { StrikeLadderComponent } from './overview/components/strike-ladder/strike-ladder.component';
import { ChainGridHeatmapComponent } from './overview/components/chain-grid-heatmap/chain-grid-heatmap.component';
import { CollectionStatusComponent } from './overview/components/collection-status/collection-status.component';
import { ResearchSummaryComponent } from './overview/components/research-summary/research-summary.component';
import { PaperWorkspaceComponent } from './overview/components/paper-workspace/paper-workspace.component';
import { PaperReplayChartComponent } from './overview/components/paper-replay-chart/paper-replay-chart.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { CaptureHistoryComponent } from './overview/components/capture-history/capture-history.component';
import { GammaProfileComponent } from './overview/components/gamma-profile/gamma-profile.component';
import { MarketSnapshotComponent } from './overview/components/market-snapshot/market-snapshot.component';
import { SessionTrendsComponent } from './overview/components/session-trends/session-trends.component';
import { SignedGexMapComponent } from './overview/components/signed-gex-map/signed-gex-map.component';
import { TracePageComponent } from './overview/trace-page.component';
import { TraceRoutingModule } from './trace-routing.module';
import { PaperLedgerComponent } from './overview/components/paper-ledger/paper-ledger.component';
import { PaperNowComponent } from './overview/components/paper-now/paper-now.component';

@NgModule({
  declarations: [
    TracePageComponent,
    PaperWorkspaceComponent,
    CaptureHistoryComponent,
    GammaProfileComponent,
    MarketSnapshotComponent,
    SessionTrendsComponent,
    SignedGexMapComponent,
  ],
  imports: [PaperReplayChartComponent, CommonModule, FormsModule, SharedMaterialModule, TraceRoutingModule, PaperLedgerComponent, PaperNowComponent, ResearchSummaryComponent, StrikeLadderComponent, ChainGridHeatmapComponent, CollectionStatusComponent],
})
export class TraceModule {}
