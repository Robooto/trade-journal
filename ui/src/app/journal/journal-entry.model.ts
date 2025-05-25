// src/app/journal-entry.model.ts
export interface JournalEntry {
  id: string;            // uuid
  date: string;          // ISO date
  esPrice: number;       // e.g. ES level
  delta: number;         // your account delta
  notes: string;         // morning thoughts
  events: {              // intra-day marker points
    time: string;
    price: number;
    note: string;
  }[];
  marketDirection: 'up' | 'down';
}
