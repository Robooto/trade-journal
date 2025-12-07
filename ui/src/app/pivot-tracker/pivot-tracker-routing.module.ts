import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PivotTrackerPageComponent } from './pivot-tracker-page/pivot-tracker-page.component';

const routes: Routes = [
  { path: '', component: PivotTrackerPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PivotTrackerRoutingModule {}
