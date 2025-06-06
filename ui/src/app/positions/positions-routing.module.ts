import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PositionsPageComponent } from './positions-page/positions-page.component';

const routes: Routes = [
  { path: '', component: PositionsPageComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PositionsRoutingModule {}
