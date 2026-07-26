import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { CharmPageComponent } from './charm/charm-page.component';
import { SignedGexMapComponent } from './overview/components/signed-gex-map/signed-gex-map.component';
import { TracePageComponent } from './overview/trace-page.component';
import { TraceRoutingModule } from './trace-routing.module';
import { TraceShellComponent } from './trace-shell/trace-shell.component';

@NgModule({
  declarations: [
    TraceShellComponent,
    TracePageComponent,
    SignedGexMapComponent,
    CharmPageComponent,
  ],
  imports: [CommonModule, FormsModule, SharedMaterialModule, TraceRoutingModule],
})
export class TraceModule {}