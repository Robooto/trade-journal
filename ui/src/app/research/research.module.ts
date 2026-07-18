import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { SharedMaterialModule } from '../shared/material.module';
import { FlowIdeasPageComponent } from './flow-ideas/flow-ideas-page.component';
import { ResearchRoutingModule } from './research-routing.module';
import { ResearchShellComponent } from './research-shell/research-shell.component';

@NgModule({
  declarations: [ResearchShellComponent, FlowIdeasPageComponent],
  imports: [CommonModule, SharedMaterialModule, ResearchRoutingModule],
})
export class ResearchModule {}
