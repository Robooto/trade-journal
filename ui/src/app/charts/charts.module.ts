import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import { SharedMaterialModule } from '../shared/material.module';
import { ChartsRoutingModule } from './charts-routing.module';

import { ChartsPageComponent } from './charts-page/charts-page.component';

@NgModule({
  declarations: [
    ChartsPageComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedMaterialModule,
    ChartsRoutingModule
  ],
  providers: []
})
export class ChartsModule {}