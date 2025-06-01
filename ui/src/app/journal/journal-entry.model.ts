export interface JournalEntry {
  id: string;            // uuid
  date: string;
  esPrice: number;
  delta: number;
  notes: string;
  events: {
    time: string;
    price: number;
    note: string;
  }[];
  marketDirection: 'up' | 'down';
}
