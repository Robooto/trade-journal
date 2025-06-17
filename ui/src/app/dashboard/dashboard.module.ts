import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedMaterialModule } from '../shared/material.module';
import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardPageComponent } from './dashboard-page/dashboard-page.component';

@NgModule({
  declarations: [DashboardPageComponent],
  imports: [CommonModule, SharedMaterialModule, DashboardRoutingModule],
})
export class DashboardModule {}
