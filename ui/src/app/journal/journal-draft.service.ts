import { Injectable } from '@angular/core';

export interface JournalDraft<T = Record<string, unknown>> {
  savedAt: string;
  value: T;
}

@Injectable({ providedIn: 'root' })
export class JournalDraftService {
  private readonly key = 'trade-journal.entry-draft.v1';

  load<T>(): JournalDraft<T> | null {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) as JournalDraft<T> : null;
    } catch {
      this.clear();
      return null;
    }
  }

  save<T>(value: T): JournalDraft<T> {
    const draft = { savedAt: new Date().toISOString(), value };
    localStorage.setItem(this.key, JSON.stringify(draft));
    return draft;
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}