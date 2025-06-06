import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedMaterialModule } from '../shared/material.module';
import { PositionsRoutingModule } from './positions-routing.module';
import { PositionsPageComponent } from './positions-page/positions-page.component';

@NgModule({
  declarations: [PositionsPageComponent],
  imports: [CommonModule, SharedMaterialModule, PositionsRoutingModule],
})
export class PositionsModule {}
