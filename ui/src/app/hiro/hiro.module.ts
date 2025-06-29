import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedMaterialModule } from '../shared/material.module';
import { HiroRoutingModule } from './hiro-routing.module';
import { HiroPageComponent } from './hiro-page/hiro-page.component';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [HiroPageComponent],
  imports: [CommonModule, SharedMaterialModule, HttpClientModule, HiroRoutingModule],
})
export class HiroModule {}
