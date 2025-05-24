import { Injectable } from '@angular/core';
import {JournalEntry} from './journal-entry.model';

@Injectable({
  providedIn: 'root'
})
export class JournalStorageService {
  private storageKey = 'tradeJournalEntries';
  constructor() { }


  getAll(): JournalEntry[] {
    const raw = localStorage.getItem(this.storageKey);
    return raw ? JSON.parse(raw) : [];
  }

  save(entries: JournalEntry[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(entries));
  }
}
