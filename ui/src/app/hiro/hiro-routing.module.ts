import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HiroPageComponent } from './hiro-page/hiro-page.component';

const routes: Routes = [
  { path: '', component: HiroPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class HiroRoutingModule {}
