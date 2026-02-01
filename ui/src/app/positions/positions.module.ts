import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedMaterialModule } from '../shared/material.module';
import { PositionsRoutingModule } from './positions-routing.module';
import { PositionsPageComponent } from './positions-page/positions-page.component';
import { OptionChartComponent } from './option-chart/option-chart.component';
import { BracketOrderDialogComponent } from './bracket-order-dialog/bracket-order-dialog.component';

@NgModule({
  declarations: [PositionsPageComponent, OptionChartComponent, BracketOrderDialogComponent],
  imports: [CommonModule, SharedMaterialModule, PositionsRoutingModule],
})
export class PositionsModule {}
