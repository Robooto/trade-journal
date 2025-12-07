import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import { SharedMaterialModule } from '../shared/material.module';
import { PivotTrackerRoutingModule } from './pivot-tracker-routing.module';
import { PivotTrackerPageComponent } from './pivot-tracker-page/pivot-tracker-page.component';
import { PivotLevelDialogComponent } from './pivot-level-dialog/pivot-level-dialog.component';

@NgModule({
  declarations: [PivotTrackerPageComponent, PivotLevelDialogComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedMaterialModule,
    PivotTrackerRoutingModule,
  ],
})
export class PivotTrackerModule {}
