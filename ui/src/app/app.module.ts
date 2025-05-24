// src/app/app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { AppComponent } from './app.component';
import { JournalEntryFormComponent } from './journal-entry-form/journal-entry-form.component';
import { JournalEntryListComponent } from './journal-entry-list/journal-entry-list.component';
import { JournalStorageService } from './journal-storage.service';
import {MatIcon} from '@angular/material/icon';
import {MatExpansionModule, MatExpansionPanelHeader, MatExpansionPanelTitle} from '@angular/material/expansion';

@NgModule({
  declarations: [
    AppComponent,
    JournalEntryFormComponent,
    JournalEntryListComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIcon,
    MatExpansionModule,
  ],
  providers: [JournalStorageService],
  bootstrap: [AppComponent]
})
export class AppModule { }
