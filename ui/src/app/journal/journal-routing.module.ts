import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {JournalPageComponent} from './journal-page/journal-page.component';

const routes: Routes = [
  {
    path: '',
    component: JournalPageComponent
  }
];

@NgModule({
  imports: [ RouterModule.forChild(routes) ],
  exports: [ RouterModule ]
})
export class JournalRoutingModule {}
