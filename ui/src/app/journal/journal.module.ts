import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';

import { SharedMaterialModule } from '../shared/material.module';
import { JournalRoutingModule } from './journal-routing.module';

import { JournalPageComponent } from './journal-page/journal-page.component';
import { JournalEntryFormComponent } from './journal-entry-form/journal-entry-form.component';
import { JournalEntryListComponent } from './journal-entry-list/journal-entry-list.component';

@NgModule({
  declarations: [
    JournalPageComponent,
    JournalEntryFormComponent,
    JournalEntryListComponent
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SharedMaterialModule,
    JournalRoutingModule
  ],
  providers: []
})
export class JournalModule {}
