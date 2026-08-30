import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { CharmWidgetComponent } from './charm/charm-widget.component';
import { CaptureHistoryComponent } from './overview/components/capture-history/capture-history.component';
import { GammaProfileComponent } from './overview/components/gamma-profile/gamma-profile.component';
import { MarketSnapshotComponent } from './overview/components/market-snapshot/market-snapshot.component';
import { Personal0DteWatchComponent } from './overview/components/personal-0dte-watch/personal-0dte-watch.component';
import { StrategyPostureComponent } from './overview/components/strategy-posture/strategy-posture.component';
import { SessionTrendsComponent } from './overview/components/session-trends/session-trends.component';
import { SignedGexMapComponent } from './overview/components/signed-gex-map/signed-gex-map.component';
import { TracePageComponent } from './overview/trace-page.component';
import { TraceRoutingModule } from './trace-routing.module';

@NgModule({
  declarations: [
    TracePageComponent,
    CaptureHistoryComponent,
    GammaProfileComponent,
    MarketSnapshotComponent,
    Personal0DteWatchComponent,
    StrategyPostureComponent,
    SessionTrendsComponent,
    SignedGexMapComponent,
    CharmWidgetComponent,
  ],
  imports: [CommonModule, FormsModule, SharedMaterialModule, TraceRoutingModule],
})
export class TraceModule {}
