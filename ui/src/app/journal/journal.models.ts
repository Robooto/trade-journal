export interface JournalEvent {
  time: string;
  price: number;
  note: string;
}

export interface JournalEntry {
  id: string;            // uuid
  date: string;
  esPrice: number;
  delta: number;
  notes: string;
  events: JournalEvent[];
  marketDirection: 'up' | 'down';
}

export interface PaginatedJournalEntries {
  total: number;
  items: JournalEntry[];
  skip: number;
  limit: number;
}
